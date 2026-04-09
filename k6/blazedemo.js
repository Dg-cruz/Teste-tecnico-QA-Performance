import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { parseHTML } from 'k6/html';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'https://www.blazedemo.com';


const CITIES = [
  'Paris',
  'Philadelphia',
  'Boston',
  'Portland',
  'San Diego',
  'Buenos Aires',
  'Rome',
  'London',
  'Berlin',
  'New York',
];

function pickRoute() {
 
  const from = randomItem(CITIES);
  let to = randomItem(CITIES);
  for (let i = 0; i < 5 && to === from; i++) to = randomItem(CITIES);
  if (to === from) to = randomItem(CITIES.filter((c) => c !== from));
  return { from, to };
}

function formUrlEncode(obj) {
  const pairs = [];
  for (const [k, v] of Object.entries(obj)) {
   
    pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`);
  }
  return pairs.join('&');
}

function mustAttr(el, attrName) {
  const v = el.attr(attrName);
  return v == null ? '' : v;
}

function parseFlightChoice(reserveHtml) {
  const formMatch = reserveHtml.match(/<form[^>]*action="purchase\.php"[^>]*>[\s\S]*?<\/form>/i);
  if (!formMatch) return null;

  const formBlock = formMatch[0];
  const inputTags = formBlock.match(/<input[^>]*>/gi) || [];

  const data = {};
  for (const tag of inputTags) {
    
    if (!/type\s*=\s*"hidden"/i.test(tag)) continue;

    const nameMatch = tag.match(/name\s*=\s*"([^"]+)"/i);
    const valueMatch = tag.match(/value\s*=\s*"([^"]*)"/i);
    const name = nameMatch ? nameMatch[1] : '';
    const value = valueMatch ? valueMatch[1] : '';
    if (!name) continue;
    data[name] = value;
  }

  if (!data.flight) return null;
  return data;
}

function parseConfirmationId(confirmationHtml) {
  if (!confirmationHtml) return null;
  const m = confirmationHtml.match(/<td>\s*Id\s*<\/td>\s*<td>\s*([^<]+)\s*<\/td>/i);
  return m ? String(m[1]).trim() : null;
}

export const options = (() => {
  const testType = (__ENV.TEST_TYPE || 'load').toLowerCase();
  const rps = Number(__ENV.RPS || 250);

  const base = {
   
    thresholds: {
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(90)<2000'],
      checks: ['rate>0.99'],
    },
    tags: {
      app: 'blazedemo',
    },
  
    noConnectionReuse: false,
    userAgent: 'k6-performance-test (blazedemo)',
  };

  if (testType === 'spike') {
    return {
      ...base,
      scenarios: {
        spike_250rps: {
          executor: 'ramping-arrival-rate',
          timeUnit: '1s',
          preAllocatedVUs: Number(__ENV.PRE_VUS || 600),
          maxVUs: Number(__ENV.MAX_VUS || 2000),
          stages: [
            // Warm-up
            { target: 50, duration: '30s' },
            // Sudden spike to 250 RPS
            { target: rps, duration: '10s' },
            // Hold at 250 RPS
            { target: rps, duration: '2m' },
            // Drop back down
            { target: 50, duration: '10s' },
            { target: 0, duration: '10s' },
          ],
        },
      },
    };
  }

  // Default: sustained load at 250 RPS.
  return {
    ...base,
    scenarios: {
      load_250rps: {
        executor: 'constant-arrival-rate',
        rate: rps,
        timeUnit: '1s',
        duration: __ENV.DURATION || '5m',
        preAllocatedVUs: Number(__ENV.PRE_VUS || 600),
        maxVUs: Number(__ENV.MAX_VUS || 2000),
      },
    },
  };
})();

export default function () {
  group('Compra de passagem aérea - sucesso', () => {
    const { from, to } = pickRoute();

    const commonHeaders = {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirects: 5,
      tags: { name: 'GET /' },
    };

    const homeRes = http.get(`${BASE_URL}/`, commonHeaders);
    check(homeRes, {
      'home: status 200': (r) => r.status === 200,
      'home: has destination form': (r) => r.body && r.body.includes('destination of the week'),
    });

    const findFlightsPayload = formUrlEncode({
      fromPort: from,
      toPort: to,
    });

    const reserveRes = http.post(`${BASE_URL}/reserve.php`, findFlightsPayload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirects: 5,
      tags: { name: 'POST /reserve.php' },
    });

    const flightChoice = parseFlightChoice(reserveRes.body);
    check(reserveRes, {
      'reserve: status 200': (r) => r.status === 200,
      'reserve: found flight option': () => flightChoice !== null,
    });
    if (!flightChoice) return;

    const purchasePayload = formUrlEncode(flightChoice);
    const purchaseRes = http.post(`${BASE_URL}/purchase.php`, purchasePayload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirects: 5,
      tags: { name: 'POST /purchase.php' },
    });

    check(purchaseRes, {
      'purchase: status 200': (r) => r.status === 200,
      'purchase: has confirmation form': (r) => r.body && r.body.includes('confirmation.php') && r.body.includes('inputName'),
    });

    // Confirmation step (based on provided curl).
    const confirmationPayload = formUrlEncode({
      _token: '',
      address: 'Rua Luiz Pereira Barreto',
      cardType: 'visa',
      city: 'Marilia',
      creditCardMonth: String(randomIntBetween(1, 12)).padStart(2, '0'),
      creditCardNumber: '4485 8777 7892 5773',
      creditCardYear: '2017',
      inputName: 'Clyde John',
      nameOnCard: 'John Clyde',
      state: 'Bahia',
      zipCode: '72920-864',
    });

    const confirmationRes = http.post(`${BASE_URL}/confirmation.php`, confirmationPayload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirects: 5,
      tags: { name: 'POST /confirmation.php' },
    });

    const confirmationId = parseConfirmationId(confirmationRes.body || '');
    check(confirmationRes, {
      'confirmation: status 200': (r) => r.status === 200,
      'confirmation: success message': (r) => (r.body || '').includes('Thank you for your purchase today!'),
      'confirmation: has Id': () => confirmationId !== null && confirmationId.length > 0,
    });
  });

    sleep(Math.random() * 0.2);
}

# Teste de Performance (k6) — BlazeDemo

URL alvo: `https://www.blazedemo.com`

## Cenário

- **Compra de passagem aérea**: home → buscar voos → escolher voo → preencher dados → **passagem comprada com sucesso**.

## Critério de aceitação

- **Vazão**: 250 requisições por segundo (RPS)
- **Performance**: **p90 < 2s** (90th percentil do `http_req_duration`)

## Pré-requisitos

- **k6 instalado** (ex.: `k6 version`)
- Acesso à internet para atingir o BlazeDemo

## Como executar

## Relatórios pós-teste (HTML)

Ao final de cada execução, o k6 chama a função `handleSummary()` do script e gera um HTML em `reports/`:

- **Load**: `reports/load-report.html`
- **Spike**: `reports/spike-report.html`

Além do HTML, recomenda-se manter o JSON do k6 para auditoria via `--summary-export`.

### Teste de carga (sustentado em 250 RPS)

Executa o fluxo completo de compra em **chegada constante**.

- **Local (critério completo)**: 250 iterações/s por 5 minutos
- **CI/CD (padrão)**: reduzido para não estourar tempo/recursos (configurável via env)

```bash
k6 run -e RPS=250 -e DURATION=5m --summary-export reports/load-summary.json k6/load.test.js
```

O teste também gera **relatório HTML** automaticamente em `reports/load-report.html`.

Para rodar no modo “CI friendly” (durações menores):

```bash
k6 run -e CI=true --summary-export reports/load-summary.json k6/load.test.js
```

### Teste de pico (spike até 250 RPS)

Rampa rápida até o alvo, sustenta e reduz.

```bash
k6 run -e RPS=250 -e PRE_VUS=1500 -e MAX_VUS=3000 --summary-export reports/spike-summary.json k6/spike.test.js
```

O teste também gera **relatório HTML** automaticamente em `reports/spike-report.html`.

Para rodar no modo “CI friendly”:

```bash
k6 run -e CI=true --summary-export reports/spike-summary.json k6/spike.test.js
```

## Notas para CI/CD (GitHub Actions, etc.)

- Execute **load** e **spike** de forma **sequencial** (um por vez). Se rodar em paralelo no mesmo runner, pode haver conflito de porta do API server local do k6.
- Os scripts aceitam ajustes por variáveis de ambiente (`RPS`, `DURATION`, `PRE_VUS`, `MAX_VUS`, etc.).
- Por padrão, `CI=true` reduz duração/carga para manter o job rápido e previsível. Para executar o critério completo na pipeline, sobrescreva `RPS`/tempos conforme necessário.

## Relatório de execução

### Resultado — Teste de carga

- **Execução**:
  - `k6 run -e RPS=250 -e DURATION=1m -e PRE_VUS=1500 -e MAX_VUS=3000 --summary-export reports/load-summary.json k6/load.test.js`
- **Arquivo**: `reports/load-summary.json`
- **Relatório HTML**: `reports/load-report.html`
- **Principais métricas (extraídas do summary)**:
  - **Vazão do cenário (iterations/s)**: **~165.45 it/s** (`iterations.rate`)
  - **RPS HTTP agregado**: **~517.08 req/s** (`http_reqs.rate`)  
    (cada iteração faz 4 requisições HTTP: `/`, `reserve.php`, `purchase.php`, `confirmation.php`)
  - **p90 `http_req_duration`**: **~10.31s** (`http_req_duration.p(90)`)
  - **Erros HTTP (`http_req_failed`)**: **~43.62%** (`http_req_failed.value`)
  - **Dropped iterations**: **2321** (`dropped_iterations.count`)
- **Conclusão do critério de aceitação**: **NÃO ATENDEU**
  - Não sustentou 250 iterações/s (houve `dropped_iterations` e a taxa efetiva ficou ~165 it/s)
  - O **p90** ficou **bem acima** de 2s (≈10s)
  - A taxa de falhas HTTP ficou elevada (≈44%)

### Resultado — Teste de pico

- **Execução**:
  - `k6 run -e RPS=250 -e PRE_VUS=1500 -e MAX_VUS=3000 --summary-export reports/spike-summary.json k6/spike.test.js`
- **Arquivo**: `reports/spike-summary.json`
- **Relatório HTML**: `reports/spike-report.html`
- **Principais métricas (extraídas do summary)**:
  - **Vazão do cenário (iterations/s)**: **~185.13 it/s** (`iterations.rate`)
  - **RPS HTTP agregado**: **~550.32 req/s** (`http_reqs.rate`)
  - **p90 `http_req_duration`**: **~8.63s** (`http_req_duration.p(90)`)
  - **Erros HTTP (`http_req_failed`)**: **~50.74%** (`http_req_failed.value`)
  - **Dropped iterations**: **533** (`dropped_iterations.count`)
- **Conclusão do critério de aceitação**: **NÃO ATENDEU**
  - Mesmo durante o pico alvo de 250 iterações/s, a vazão efetiva ficou ~185 it/s
  - O **p90** permaneceu **muito acima** de 2s (≈8–10s)
  - A taxa de falhas HTTP foi ainda maior (≈51%)

## Como o script valida “compra com sucesso”

O teste considera sucesso quando a resposta de `POST /confirmation.php`:

- retorna **HTTP 200**
- contém o texto **`Thank you for your purchase today!`**
- possui o campo **`Id`** na tabela de confirmação

## Considerações importantes

- O BlazeDemo é um site de demonstração e pode variar performance conforme carga global, rede e limitação do próprio ambiente.
- O critério de aceitação está expresso em **p90 do `http_req_duration`** (métrica padrão do k6), com **threshold** configurado para falhar o teste se \(p90 \ge 2s\).
- Nesta execução, os sintomas (p90 alto + muitas falhas + iterações dropadas) são compatíveis com **saturação/instabilidade do sistema alvo** sob a carga solicitada e/ou **limitações do próprio ambiente externo** (site demo compartilhado, variação de rede, possíveis proteções).


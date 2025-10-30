const timeline = document.getElementById("timeline");
const ctx = timeline.getContext("2d");

const solarInput = document.getElementById("solar");
const batteryInput = document.getElementById("battery");
const volInput = document.getElementById("vol");
const simulateBtn = document.getElementById("simulate");
const stressBtn = document.getElementById("stress");

const solarVal = document.getElementById("solarVal");
const batteryVal = document.getElementById("batteryVal");
const volVal = document.getElementById("volVal");

const peakText = document.getElementById("peak");
const energyText = document.getElementById("energy");
const costText = document.getElementById("cost");
const selfText = document.getElementById("self");

let snapshot = null;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function buildSeries() {
  const solarCap = Number(solarInput.value);
  const volatility = Number(volInput.value);

  const demand = [];
  const solar = [];
  const price = [];

  for (let h = 0; h < 24; h += 1) {
    const morning = Math.exp(-((h - 8) ** 2) / 16) * 42;
    const evening = Math.exp(-((h - 19) ** 2) / 12) * 58;
    const baseLoad = 42 + morning + evening + rand(-4, 4);

    const sunCurve = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
    const cloudNoise = 1 - rand(0, 0.28) * volatility;

    demand.push(baseLoad);
    solar.push(solarCap * sunCurve * cloudNoise);

    const dynamicPrice = 56 + 48 * (baseLoad / 130) + rand(-6, 6) * volatility;
    price.push(Math.max(24, dynamicPrice));
  }

  return { demand, solar, price };
}

function optimizeDispatch() {
  const batteryCap = Number(batteryInput.value);
  const batteryPowerCap = Math.max(20, batteryCap * 0.35);
  const roundtripEff = 0.92;

  const { demand, solar, price } = buildSeries();
  const charge = Array(24).fill(0);
  const discharge = Array(24).fill(0);
  const grid = Array(24).fill(0);
  const soc = Array(24).fill(0);

  let state = batteryCap * 0.35;

  for (let h = 0; h < 24; h += 1) {
    const net = demand[h] - solar[h];

    // Discharge on high price / high net load hours.
    const dischargeIntent = net > 0 && price[h] > 78;
    if (dischargeIntent) {
      const out = Math.min(net, batteryPowerCap, state * roundtripEff);
      discharge[h] = out;
      state -= out / roundtripEff;
    }

    // Charge when there is excess solar or cheap grid hours.
    const remainingNet = net - discharge[h];
    const cheapHour = price[h] < 62;
    const chargeSource = remainingNet < 0 ? -remainingNet : cheapHour ? Math.min(18, batteryPowerCap) : 0;

    const room = batteryCap - state;
    const inFlow = Math.min(chargeSource, batteryPowerCap, room);
    charge[h] = inFlow;
    state += inFlow;

    grid[h] = Math.max(0, remainingNet + charge[h]);
    soc[h] = state;
  }

  snapshot = { demand, solar, price, charge, discharge, grid, soc, batteryCap };
  updateMetrics();
  draw();
}

function runStressTest() {
  volInput.value = Math.min(1, Number(volInput.value) + 0.2).toFixed(2);
  solarInput.value = Math.max(20, Number(solarInput.value) - 10);
  syncLabels();
  optimizeDispatch();
}

function updateMetrics() {
  if (!snapshot) return;

  const { demand, solar, grid, price } = snapshot;

  const peak = Math.max(...grid);
  const totalGrid = grid.reduce((a, b) => a + b, 0);
  const totalDemand = demand.reduce((a, b) => a + b, 0);
  const totalCost = grid.reduce((sum, g, i) => sum + (g * price[i]) / 1000, 0);
  const selfSufficiency = 1 - totalGrid / Math.max(1, totalDemand);

  peakText.textContent = `${peak.toFixed(1)} MW`;
  energyText.textContent = `${totalGrid.toFixed(1)} MWh`;
  costText.textContent = `$${totalCost.toFixed(2)}k`;
  selfText.textContent = `${(selfSufficiency * 100).toFixed(1)}%`;
}

function drawAxis(x, y, w, h, maxY) {
  ctx.strokeStyle = "rgba(180,230,220,0.24)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i += 1) {
    const yy = y + (i / 5) * h;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();

    const val = (maxY * (1 - i / 5)).toFixed(0);
    ctx.fillStyle = "#bfece4";
    ctx.font = "11px monospace";
    ctx.fillText(val, x - 34, yy + 4);
  }

  for (let hIdx = 0; hIdx < 24; hIdx += 3) {
    const xx = x + (hIdx / 23) * w;
    ctx.fillStyle = "#bfece4";
    ctx.fillText(String(hIdx).padStart(2, "0"), xx - 6, y + h + 18);
  }
}

function polyline(values, color, x, y, w, h, maxY) {
  ctx.beginPath();
  values.forEach((v, i) => {
    const px = x + (i / (values.length - 1)) * w;
    const py = y + h - (v / maxY) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function draw() {
  ctx.clearRect(0, 0, timeline.width, timeline.height);
  ctx.fillStyle = "#07100f";
  ctx.fillRect(0, 0, timeline.width, timeline.height);

  if (!snapshot) return;

  const x = 56;
  const y = 24;
  const w = timeline.width - 92;
  const h = timeline.height - 68;

  const { demand, solar, grid, charge, discharge } = snapshot;

  const maxY = Math.max(...demand, ...solar, ...grid, ...charge, ...discharge, 1) * 1.2;
  drawAxis(x, y, w, h, maxY);

  polyline(demand, "#ffb892", x, y, w, h, maxY);
  polyline(solar, "#9dffd2", x, y, w, h, maxY);
  polyline(grid, "#8fc4ff", x, y, w, h, maxY);
  polyline(discharge, "#f7ef9a", x, y, w, h, maxY);

  ctx.fillStyle = "#d9f6f1";
  ctx.font = "12px monospace";
  ctx.fillText("Demand", 66, 18);
  ctx.fillStyle = "#9dffd2";
  ctx.fillText("Solar", 138, 18);
  ctx.fillStyle = "#8fc4ff";
  ctx.fillText("Grid", 198, 18);
  ctx.fillStyle = "#f7ef9a";
  ctx.fillText("Battery Discharge", 248, 18);
}

function syncLabels() {
  solarVal.textContent = solarInput.value;
  batteryVal.textContent = batteryInput.value;
  volVal.textContent = Number(volInput.value).toFixed(2);
}

[solarInput, batteryInput, volInput].forEach((el) => {
  el.addEventListener("input", syncLabels);
});

simulateBtn.addEventListener("click", optimizeDispatch);
stressBtn.addEventListener("click", runStressTest);

syncLabels();
optimizeDispatch();

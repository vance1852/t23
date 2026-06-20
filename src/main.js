import { sampleSensors } from "./data/sensors.js";
import {
  CONFIG,
  getStatusFromReading,
  getTemperatureColor,
  getHumidityColor,
  getBatteryColor,
} from "./config/index.js";
import { ColdStorageScene } from "./scene/ColdStorageScene.js";
import Chart from "chart.js/auto";

class DashboardApp {
  constructor() {
    this.sensors = sampleSensors;
    this.filteredSensors = [...this.sensors];
    this.selectedSensor = null;
    this.colorMode = "temperature";
    this.filters = {
      status: new Set([
        "normal",
        "too_cold",
        "too_hot",
        "humidity_high",
        "offline",
      ]),
      productTypes: new Set(),
      racks: new Set(),
    };
    this.heatmapCellFilter = null;
    this.chart = null;

    this._init();
  }

  _init() {
    this._initScene();
    this._initFilters();
    this._initUI();
    this._initHeatmap();
    this._updateStats();
    this._updateAbnormalList();
  }

  _initScene() {
    const canvas = document.getElementById("three-canvas");
    this.scene = new ColdStorageScene(canvas);
    this.scene.setSensors(this.sensors);
    this.scene.onSensorClick = (sensor) => this._showSensorDetail(sensor);
  }

  _initFilters() {
    const productTypes = [...new Set(this.sensors.map((s) => s.productType))];
    const productGroup = document.getElementById("filter-product");
    productTypes.forEach((type) => {
      const config = CONFIG.productTypes[type];
      const label = document.createElement("label");
      label.className = "filter-item";
      label.innerHTML = `
        <input type="checkbox" value="${type}" checked />
        <span>${config ? config.name : type}</span>
      `;
      productGroup.appendChild(label);
      this.filters.productTypes.add(type);
    });

    const rackCount = CONFIG.warehouse.rackRows;
    const rackGroup = document.getElementById("filter-rack");
    for (let i = 0; i < rackCount; i++) {
      const label = document.createElement("label");
      label.className = "filter-item";
      label.innerHTML = `
        <input type="checkbox" value="${i}" checked />
        <span>第 ${i + 1} 排</span>
      `;
      rackGroup.appendChild(label);
      this.filters.racks.add(String(i));
    }

    document.getElementById("filter-status").addEventListener("change", (e) => {
      if (e.target.type === "checkbox") {
        const value = e.target.value;
        if (e.target.checked) {
          this.filters.status.add(value);
        } else {
          this.filters.status.delete(value);
        }
        this._applyFilters();
      }
    });

    productGroup.addEventListener("change", (e) => {
      if (e.target.type === "checkbox") {
        const value = e.target.value;
        if (e.target.checked) {
          this.filters.productTypes.add(value);
        } else {
          this.filters.productTypes.delete(value);
        }
        this._applyFilters();
      }
    });

    rackGroup.addEventListener("change", (e) => {
      if (e.target.type === "checkbox") {
        const value = e.target.value;
        if (e.target.checked) {
          this.filters.racks.add(value);
        } else {
          this.filters.racks.delete(value);
        }
        this._applyFilters();
      }
    });
  }

  _initUI() {
    const modeBtns = document.querySelectorAll(".mode-btn");
    modeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        modeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.colorMode = btn.dataset.mode;
        this.scene.setColorMode(this.colorMode);
      });
    });

    document.getElementById("export-btn").addEventListener("click", () => {
      this._exportAbnormalList();
    });

    document.getElementById("abnormal-list").addEventListener("click", (e) => {
      const item = e.target.closest(".abnormal-item");
      if (item) {
        const sensorId = item.dataset.sensorId;
        this._focusOnSensor(sensorId);
      }
    });
  }

  _initHeatmap() {
    const { rackRows, levels } = CONFIG.warehouse;
    const grid = document.getElementById("heatmap-grid");
    grid.style.gridTemplateColumns = `repeat(${rackRows}, 1fr)`;

    for (let level = levels - 1; level >= 0; level--) {
      for (let rack = 0; rack < rackRows; rack++) {
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        cell.dataset.rack = rack;
        cell.dataset.level = level;
        cell.innerHTML = `<span class="cell-label">${rack + 1}-${level + 1}</span>`;
        cell.addEventListener("click", () => {
          this._toggleHeatmapCell(rack, level, cell);
        });
        grid.appendChild(cell);
      }
    }

    this._updateHeatmapColors();
  }

  _updateHeatmapColors() {
    const { rackRows, levels } = CONFIG.warehouse;
    const cells = document.querySelectorAll(".heatmap-cell");

    let maxDensity = 0;
    const densityMap = {};

    for (let rack = 0; rack < rackRows; rack++) {
      for (let level = 0; level < levels; level++) {
        const key = `${rack}-${level}`;
        const cellSensors = this.sensors.filter(
          (s) => s.rack === rack && s.level === level,
        );
        const abnormalCount = cellSensors.filter((s) => {
          const status = getStatusFromReading(s);
          return status !== "normal" && status !== "offline";
        }).length;
        const offlineCount = cellSensors.filter(
          (s) => getStatusFromReading(s) === "offline",
        ).length;
        const density = abnormalCount + offlineCount * 0.5;
        densityMap[key] = density;
        maxDensity = Math.max(maxDensity, density);
      }
    }

    cells.forEach((cell) => {
      const rack = parseInt(cell.dataset.rack);
      const level = parseInt(cell.dataset.level);
      const key = `${rack}-${level}`;
      const density = densityMap[key] || 0;

      let color;
      if (maxDensity === 0 || density === 0) {
        color = "#1e293b";
      } else {
        const ratio = density / maxDensity;
        if (ratio < 0.25) {
          color = "#10b981";
        } else if (ratio < 0.5) {
          color = "#84cc16";
        } else if (ratio < 0.75) {
          color = "#fbbf24";
        } else {
          color = "#ef4444";
        }
      }

      cell.style.backgroundColor = color;
    });
  }

  _toggleHeatmapCell(rack, level, cell) {
    if (
      this.heatmapCellFilter &&
      this.heatmapCellFilter.rack === rack &&
      this.heatmapCellFilter.level === level
    ) {
      this.heatmapCellFilter = null;
      cell.classList.remove("active");
    } else {
      document
        .querySelectorAll(".heatmap-cell")
        .forEach((c) => c.classList.remove("active"));
      this.heatmapCellFilter = { rack, level };
      cell.classList.add("active");
    }
    this._applyFilters();
  }

  _applyFilters() {
    this.filteredSensors = this.sensors.filter((sensor) => {
      const status = getStatusFromReading(sensor);
      if (!this.filters.status.has(status)) return false;
      if (!this.filters.productTypes.has(sensor.productType)) return false;
      if (!this.filters.racks.has(String(sensor.rack))) return false;
      if (this.heatmapCellFilter) {
        if (
          sensor.rack !== this.heatmapCellFilter.rack ||
          sensor.level !== this.heatmapCellFilter.level
        ) {
          return false;
        }
      }
      return true;
    });

    this.scene.setFilter(
      this.filteredSensors.map((s) => s.id),
      this.heatmapCellFilter,
    );

    this._updateStats();
    this._updateAbnormalList();
  }

  _updateStats() {
    const total = this.filteredSensors.length;
    const statuses = this.filteredSensors.map((s) => getStatusFromReading(s));
    const abnormal = statuses.filter(
      (s) => s !== "normal" && s !== "offline",
    ).length;
    const offline = statuses.filter((s) => s === "offline").length;

    const onlineSensors = this.filteredSensors.filter(
      (s) => getStatusFromReading(s) !== "offline",
    );
    const avgTemp =
      onlineSensors.length > 0
        ? (
            onlineSensors.reduce(
              (sum, s) => sum + s.currentReading.temperature,
              0,
            ) / onlineSensors.length
          ).toFixed(1)
        : "--";
    const maxHumidity =
      onlineSensors.length > 0
        ? Math.max(
            ...onlineSensors.map((s) => s.currentReading.humidity),
          ).toFixed(1)
        : "--";

    document.getElementById("stat-total").textContent = total;
    document.getElementById("stat-abnormal").textContent = abnormal;
    document.getElementById("stat-offline").textContent = offline;
    document.getElementById("stat-avg-temp").textContent =
      avgTemp + (onlineSensors.length > 0 ? "°C" : "");
    document.getElementById("stat-max-humidity").textContent =
      maxHumidity + (onlineSensors.length > 0 ? "%" : "");
  }

  _updateAbnormalList() {
    const list = document.getElementById("abnormal-list");
    list.innerHTML = "";

    const abnormalSensors = this.filteredSensors.filter((s) => {
      const status = getStatusFromReading(s);
      return status !== "normal";
    });

    if (abnormalSensors.length === 0) {
      list.innerHTML =
        '<div style="color:#64748b;font-size:12px;padding:10px;text-align:center;">暂无异常</div>';
      return;
    }

    abnormalSensors.forEach((sensor) => {
      const status = getStatusFromReading(sensor);
      const statusClass = `status-${status.replace("_", "-")}`;
      const statusLabel = CONFIG.statusLabels[status];

      let desc = "";
      if (status === "too_hot") {
        desc = `温度 ${sensor.currentReading.temperature}°C，偏高`;
      } else if (status === "too_cold") {
        desc = `温度 ${sensor.currentReading.temperature}°C，偏低`;
      } else if (status === "humidity_high") {
        desc = `湿度 ${sensor.currentReading.humidity}%，偏高`;
      } else if (status === "offline") {
        desc = "设备离线";
      }

      const item = document.createElement("div");
      item.className = `abnormal-item ${statusClass}`;
      item.dataset.sensorId = sensor.id;
      item.innerHTML = `
        <div class="abnormal-item-name">${sensor.id} · ${sensor.positionLabel}</div>
        <div class="abnormal-item-desc">${statusLabel} · ${desc}</div>
      `;
      list.appendChild(item);
    });
  }

  _showSensorDetail(sensor) {
    this.selectedSensor = sensor;
    const status = getStatusFromReading(sensor);

    document.getElementById("panel-empty").style.display = "none";
    document.getElementById("panel-content").style.display = "block";

    document.getElementById("detail-title").textContent = `传感器 ${sensor.id}`;
    document.getElementById("detail-id").textContent = sensor.id;
    document.getElementById("detail-status").textContent =
      CONFIG.statusLabels[status];
    document.getElementById("detail-rack").textContent =
      `第 ${sensor.rack + 1} 排`;
    document.getElementById("detail-slot").textContent =
      `第 ${sensor.slot + 1} 货位`;
    document.getElementById("detail-level").textContent =
      `第 ${sensor.level + 1} 层`;
    document.getElementById("detail-product").textContent = sensor.productName;
    document.getElementById("detail-temp").textContent =
      `${sensor.currentReading.temperature}°C`;
    document.getElementById("detail-temp-range").textContent =
      `${sensor.tempRange.min}°C ~ ${sensor.tempRange.max}°C`;
    document.getElementById("detail-humidity").textContent =
      `${sensor.currentReading.humidity}%`;
    document.getElementById("detail-battery").textContent =
      `${sensor.battery}%`;
    document.getElementById("detail-last-report").textContent =
      this._formatTime(sensor.lastReportTime);

    this._updateChart(sensor);
  }

  _updateChart(sensor) {
    const ctx = document.getElementById("detail-chart").getContext("2d");

    if (this.chart) {
      this.chart.destroy();
    }

    const labels = sensor.history.map((h, i) => {
      const d = new Date(h.timestamp);
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    });

    const tempData = sensor.history.map((h) => h.temperature);
    const humidityData = sensor.history.map((h) => h.humidity);

    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "温度 (°C)",
            data: tempData,
            borderColor: "#f97316",
            backgroundColor: "rgba(249, 115, 22, 0.1)",
            yAxisID: "y",
            tension: 0.3,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: "#f97316",
          },
          {
            label: "湿度 (%)",
            data: humidityData,
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.1)",
            yAxisID: "y1",
            tension: 0.3,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: "#38bdf8",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              color: "#94a3b8",
              font: { size: 11 },
              boxWidth: 12,
            },
          },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            titleColor: "#e2e8f0",
            bodyColor: "#cbd5e1",
            borderColor: "#334155",
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            grid: { color: "#1e293b" },
            ticks: { color: "#64748b", font: { size: 10 } },
          },
          y: {
            type: "linear",
            display: true,
            position: "left",
            grid: { color: "#1e293b" },
            ticks: {
              color: "#64748b",
              font: { size: 10 },
              callback: (value) => value + "°C",
            },
          },
          y1: {
            type: "linear",
            display: true,
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: {
              color: "#64748b",
              font: { size: 10 },
              callback: (value) => value + "%",
            },
          },
        },
      },
    });
  }

  _focusOnSensor(sensorId) {
    const sensor = this.sensors.find((s) => s.id === sensorId);
    if (sensor) {
      this._showSensorDetail(sensor);
      this.scene.focusOnSensor(sensorId);
    }
  }

  _exportAbnormalList() {
    const abnormalSensors = this.filteredSensors.filter((s) => {
      const status = getStatusFromReading(s);
      return status !== "normal";
    });

    const exportData = abnormalSensors.map((sensor) => {
      const status = getStatusFromReading(sensor);
      return {
        id: sensor.id,
        position: sensor.positionLabel,
        rack: sensor.rack + 1,
        slot: sensor.slot + 1,
        level: sensor.level + 1,
        productType: sensor.productName,
        status: CONFIG.statusLabels[status],
        statusCode: status,
        temperature: sensor.currentReading.temperature,
        humidity: sensor.currentReading.humidity,
        tempRange: `${sensor.tempRange.min}°C ~ ${sensor.tempRange.max}°C`,
        humidityRange: `${sensor.humidityRange.min}% ~ ${sensor.humidityRange.max}%`,
        battery: sensor.battery,
        lastReportTime: sensor.lastReportTime,
        lastReportTimeFormatted: this._formatTime(sensor.lastReportTime),
      };
    });

    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportTime: new Date().toISOString(),
            totalCount: exportData.length,
            sensors: exportData,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `异常清单_${this._formatDateForFilename()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  _formatTime(isoString) {
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }

  _formatDateForFilename() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new DashboardApp();
});

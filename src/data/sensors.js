import { CONFIG } from "../config/index.js";

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

function padZero(num, len = 2) {
  return String(num).padStart(len, "0");
}

function generateHistory(baseTemp, baseHumidity, count = 6) {
  const history = [];
  const now = Date.now();
  const interval = 5 * 60 * 1000;

  for (let i = count - 1; i >= 0; i--) {
    history.push({
      temperature: +(baseTemp + randomRange(-1.5, 1.5)).toFixed(1),
      humidity: +(baseHumidity + randomRange(-3, 3)).toFixed(1),
      timestamp: new Date(now - i * interval).toISOString(),
    });
  }
  return history;
}

export function generateSensors() {
  const sensors = [];
  const { rackRows, slotsPerRow, levels } = CONFIG.warehouse;
  const productKeys = Object.keys(CONFIG.productTypes);

  const anomalyMap = {};

  const setAnomaly = (rack, slot, level, type) => {
    anomalyMap[`${rack}-${slot}-${level}`] = type;
  };

  setAnomaly(0, 1, 0, "too_hot");
  setAnomaly(0, 3, 1, "too_cold");
  setAnomaly(0, 2, 2, "humidity_high");
  setAnomaly(1, 0, 0, "too_hot");
  setAnomaly(1, 2, 1, "offline");
  setAnomaly(1, 4, 2, "too_cold");
  setAnomaly(2, 1, 0, "humidity_high");
  setAnomaly(2, 3, 1, "too_hot");
  setAnomaly(2, 0, 2, "offline");
  setAnomaly(3, 2, 0, "too_cold");
  setAnomaly(3, 4, 1, "humidity_high");
  setAnomaly(3, 1, 2, "too_hot");
  setAnomaly(0, 4, 0, "too_hot");
  setAnomaly(1, 3, 0, "humidity_high");
  setAnomaly(2, 2, 2, "too_cold");
  setAnomaly(3, 0, 1, "offline");

  let idCounter = 1;

  for (let rack = 0; rack < rackRows; rack++) {
    for (let slot = 0; slot < slotsPerRow; slot++) {
      for (let level = 0; level < levels; level++) {
        const productType = productKeys[randomInt(0, productKeys.length - 1)];
        const productConfig = CONFIG.productTypes[productType];
        const anomalyType = anomalyMap[`${rack}-${slot}-${level}`];

        let baseTemp, baseHumidity;
        let lastReportMinutesAgo = randomInt(1, 15);
        let battery = randomInt(30, 95);

        if (anomalyType === "offline") {
          baseTemp = (productConfig.tempMin + productConfig.tempMax) / 2;
          baseHumidity =
            (productConfig.humidityMin + productConfig.humidityMax) / 2;
          lastReportMinutesAgo = randomInt(35, 120);
          battery = randomInt(5, 25);
        } else if (anomalyType === "too_hot") {
          baseTemp = productConfig.tempMax + randomRange(1, 4);
          baseHumidity = randomRange(
            productConfig.humidityMin,
            productConfig.humidityMax,
          );
        } else if (anomalyType === "too_cold") {
          baseTemp = productConfig.tempMin - randomRange(1, 4);
          baseHumidity = randomRange(
            productConfig.humidityMin,
            productConfig.humidityMax,
          );
        } else if (anomalyType === "humidity_high") {
          baseTemp = randomRange(productConfig.tempMin, productConfig.tempMax);
          baseHumidity = productConfig.humidityMax + randomRange(3, 8);
        } else {
          baseTemp = randomRange(
            productConfig.tempMin +
              (productConfig.tempMax - productConfig.tempMin) * 0.2,
            productConfig.tempMax -
              (productConfig.tempMax - productConfig.tempMin) * 0.2,
          );
          baseHumidity = randomRange(
            productConfig.humidityMin +
              (productConfig.humidityMax - productConfig.humidityMin) * 0.2,
            productConfig.humidityMax -
              (productConfig.humidityMax - productConfig.humidityMin) * 0.2,
          );
        }

        if (!anomalyType && randomInt(0, 100) < 10) {
          battery = randomInt(10, 19);
        }

        baseTemp = +baseTemp.toFixed(1);
        baseHumidity = +baseHumidity.toFixed(1);

        const history = generateHistory(baseTemp, baseHumidity, 6);
        const lastReportTime = new Date(
          Date.now() - lastReportMinutesAgo * 60 * 1000,
        ).toISOString();

        const sensorId = `SNS-${padZero(idCounter, 3)}`;
        idCounter++;

        sensors.push({
          id: sensorId,
          rack: rack,
          slot: slot,
          level: level,
          positionLabel: `${rack + 1}排${slot + 1}货位${level + 1}层`,
          productType: productType,
          productName: productConfig.name,
          currentReading: {
            temperature: baseTemp,
            humidity: baseHumidity,
          },
          tempRange: {
            min: productConfig.tempMin,
            max: productConfig.tempMax,
          },
          humidityRange: {
            min: productConfig.humidityMin,
            max: productConfig.humidityMax,
          },
          battery: battery,
          lastReportTime: lastReportTime,
          history: history,
        });
      }
    }
  }

  return sensors;
}

export const sampleSensors = generateSensors();

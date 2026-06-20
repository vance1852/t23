export const CONFIG = {
  offlineThresholdMinutes: 30,
  lowBatteryThreshold: 20,
  highHumidityThreshold: 85,

  productTypes: {
    frozen_meat: {
      name: "冷冻肉类",
      tempMin: -25,
      tempMax: -18,
      humidityMin: 60,
      humidityMax: 85,
    },
    seafood: {
      name: "海鲜水产",
      tempMin: -22,
      tempMax: -15,
      humidityMin: 65,
      humidityMax: 85,
    },
    fruits: {
      name: "果蔬保鲜",
      tempMin: 2,
      tempMax: 8,
      humidityMin: 75,
      humidityMax: 90,
    },
    dairy: {
      name: "乳制品",
      tempMin: 2,
      tempMax: 6,
      humidityMin: 60,
      humidityMax: 80,
    },
    vaccines: {
      name: "医药疫苗",
      tempMin: 2,
      tempMax: 8,
      humidityMin: 40,
      humidityMax: 60,
    },
    ice_cream: {
      name: "冰淇淋",
      tempMin: -28,
      tempMax: -22,
      humidityMin: 50,
      humidityMax: 70,
    },
  },

  statusColors: {
    normal: 0x10b981,
    too_cold: 0x38bdf8,
    too_hot: 0xf97316,
    humidity_high: 0xa855f7,
    offline: 0x6b7280,
  },

  statusLabels: {
    normal: "正常",
    too_cold: "偏冷",
    too_hot: "偏热",
    humidity_high: "湿度偏高",
    offline: "离线",
  },

  warehouse: {
    rackRows: 4,
    slotsPerRow: 5,
    levels: 3,
    aisleWidth: 3,
    rackWidth: 2,
    rackDepth: 1.5,
    levelHeight: 2.5,
  },
};

export function getStatusFromReading(sensor, currentTime = Date.now()) {
  const lastReportTime = new Date(sensor.lastReportTime).getTime();
  const offlineMs = CONFIG.offlineThresholdMinutes * 60 * 1000;

  if (currentTime - lastReportTime > offlineMs) {
    return "offline";
  }

  const productConfig = CONFIG.productTypes[sensor.productType];
  if (!productConfig) {
    return "normal";
  }

  const { temperature, humidity } = sensor.currentReading;

  if (temperature > productConfig.tempMax) {
    return "too_hot";
  }
  if (temperature < productConfig.tempMin) {
    return "too_cold";
  }
  if (humidity > productConfig.humidityMax) {
    return "humidity_high";
  }

  return "normal";
}

export function getTemperatureColor(temperature, productType) {
  const productConfig = CONFIG.productTypes[productType];
  if (!productConfig) return CONFIG.statusColors.normal;

  const { tempMin, tempMax } = productConfig;
  const range = tempMax - tempMin;

  if (temperature < tempMin - range * 0.3) {
    return 0x0ea5e9;
  }
  if (temperature < tempMin) {
    return 0x38bdf8;
  }
  if (temperature > tempMax + range * 0.3) {
    return 0xef4444;
  }
  if (temperature > tempMax) {
    return 0xf97316;
  }
  return CONFIG.statusColors.normal;
}

export function getHumidityColor(humidity) {
  if (humidity >= 90) return 0x7c3aed;
  if (humidity >= 80) return 0xa855f7;
  if (humidity >= 70) return 0xc084fc;
  if (humidity >= 60) return 0x86efac;
  return 0x10b981;
}

export function getBatteryColor(battery) {
  if (battery <= CONFIG.lowBatteryThreshold) return 0xef4444;
  if (battery <= 40) return 0xf97316;
  if (battery <= 60) return 0xfbbf24;
  return 0x10b981;
}

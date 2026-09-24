/**
 * Antenna array configuration helpers for TART HDF5 files
 *
 * TART deployments differ in array size (e.g. 24 antennas at zm-cbu, 32 antennas
 * elsewhere). Files therefore do not all share the same number of antennas or
 * baselines, so nothing may hardcode 24 / 276. Instead the array size is derived
 * from the file contents (baselines, visibility shape, config, gains).
 */

// Supported antenna counts. 24 -> 276 baselines, 32 -> 496 baselines.
export const SUPPORTED_ANTENNA_COUNTS = [24, 32];

/**
 * Total number of baselines for N antennas: N * (N - 1) / 2
 * @param {number} nAntennas
 * @returns {number}
 */
export function baselineCountFor(nAntennas) {
  return (nAntennas * (nAntennas - 1)) / 2;
}

/**
 * Number of antennas that produces the given number of baselines.
 * Returns null when the baseline count does not correspond to an integer
 * antenna count (i.e. the data is not a valid full-correlation set).
 * @param {number} nBaselines
 * @returns {number|null}
 */
export function antennaCountFor(nBaselines) {
  if (!Number.isFinite(nBaselines) || nBaselines < 1) return null;
  // n = (1 + sqrt(1 + 8 * nBaselines)) / 2
  const n = (1 + Math.sqrt(1 + 8 * nBaselines)) / 2;
  return Number.isInteger(n) ? n : null;
}

/**
 * Normalize a raw config `num_antenna` value (may be a string from HDF5 JSON).
 * @param {*} value
 * @returns {number|null}
 */
function normalizeAntennaCount(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 1 ? n : null;
}

/**
 * Detect the number of antennas represented by parsed HDF5 data.
 *
 * Detection order (first definitive source wins):
 *   1. baselines array length  -> N(N-1)/2
 *   2. vis matrix width        -> baselines per timestamp
 *   3. config.num_antenna
 *   4. gains/phases length
 *
 * @param {Object} data - Parsed data (baselines, visibilityData, configData, gainPhaseData)
 * @returns {{nAntennas: number|null, nBaselines: number|null, source: string|null, supported: boolean}}
 */
export function detectAntennaConfig(data = {}) {
  const { baselines, visibilityData, configData, gainPhaseData } = data;

  // 1. baselines -> antenna count
  if (Array.isArray(baselines) && baselines.length > 0) {
    const nAntennas = antennaCountFor(baselines.length);
    if (nAntennas) {
      return { nAntennas, nBaselines: baselines.length, source: "baselines", supported: SUPPORTED_ANTENNA_COUNTS.includes(nAntennas) };
    }
  }

  // 2. vis matrix width -> baseline count -> antenna count
  const nBaselines = visibilityData?.[0]?.length;
  if (Number.isInteger(nBaselines) && nBaselines > 0) {
    const nAntennas = antennaCountFor(nBaselines);
    if (nAntennas) {
      return { nAntennas, nBaselines, source: "vis", supported: SUPPORTED_ANTENNA_COUNTS.includes(nAntennas) };
    }
  }

  // 3. config num_antenna
  const configAntennas = normalizeAntennaCount(configData?.num_antenna);
  if (configAntennas) {
    return {
      nAntennas: configAntennas,
      nBaselines: baselineCountFor(configAntennas),
      source: "config",
      supported: SUPPORTED_ANTENNA_COUNTS.includes(configAntennas),
    };
  }

  // 4. gains/phases length (one entry per antenna)
  const gains = gainPhaseData?.gains;
  const phases = gainPhaseData?.phases;
  const nFromGains = Array.isArray(gains) && gains.length > 1 ? gains.length : null;
  const nFromPhases = Array.isArray(phases) && phases.length > 1 ? phases.length : null;
  const nFromGainPhase = nFromGains || nFromPhases;
  if (nFromGainPhase) {
    return {
      nAntennas: nFromGainPhase,
      nBaselines: baselineCountFor(nFromGainPhase),
      source: "gainphase",
      supported: SUPPORTED_ANTENNA_COUNTS.includes(nFromGainPhase),
    };
  }

  return { nAntennas: null, nBaselines: null, source: null, supported: false };
}

/**
 * Antenna count implied by a set of positions ([N, 2] or [N, 3]).
 * @param {Array} antennaData
 * @returns {number|null}
 */
export function antennaCountFromPositions(antennaData) {
  if (!Array.isArray(antennaData) || antennaData.length === 0) return null;
  const isPair = Array.isArray(antennaData[0]);
  if (!isPair) {
    // Flat array: infer 2 or 3 coordinates per antenna
    if (antennaData.length % 3 === 0) return antennaData.length / 3;
    if (antennaData.length % 2 === 0) return antennaData.length / 2;
    return null;
  }
  return antennaData.length;
}

/**
 * Reshape a flat antenna position array into [N, 3] using the detected antenna count.
 * @param {Array|TypedArray} flatArray
 * @param {number} nAntennas
 * @returns {Array} [N, 3] array
 */
export function reshapeAntennaPositions(flatArray, nAntennas) {
  const flat = Array.from(flatArray);
  if (!nAntennas || flat.length !== nAntennas * 3) return flat;
  const shaped = [];
  for (let i = 0; i < nAntennas; i++) {
    shaped.push([flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]]);
  }
  return shaped;
}

/**
 * Reshape a flat visibility array into [nTimes, nBaselines].
 * @param {Array|TypedArray} visData
 * @param {number} nTimes
 * @param {number} nBaselines
 * @returns {Array} [nTimes, nBaselines] array
 */
export function reshapeVisData(visData, nTimes, nBaselines) {
  const flat = Array.from(visData);
  if (!nTimes || !nBaselines || flat.length !== nTimes * nBaselines) return flat;
  const reshaped = [];
  for (let t = 0; t < nTimes; t++) {
    const timeData = [];
    for (let b = 0; b < nBaselines; b++) {
      timeData.push(flat[t * nBaselines + b]);
    }
    reshaped.push(timeData);
  }
  return reshaped;
}

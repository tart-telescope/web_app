<template>
  <div ref="chartRef" class="uplot-chart" />
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

const props = defineProps({
  series: {
    type: Array,
    default: () => [],
  },
  height: {
    type: [String, Number],
    default: 300,
  },
  width: {
    type: [String, Number],
    default: null,
  },
  options: {
    type: Object,
    default: () => ({}),
  },
  timezone: {
    type: String,
    default: undefined, // Use system timezone by default
  },
  dualAxis: {
    type: Boolean,
    default: false,
  },
  phaseRange: {
    type: Array,
    default: () => [-180, 180],
  },
  syncKey: {
    type: String,
    default: "uplot-sync",
  },
});

const emit = defineEmits(["data-point-selection", "mouse-move", "mouse-leave", "zoom-changed"]);

const chartRef = ref(null);
let chart = null;

function getContainerSize() {
  if (!chartRef.value) return { width: 800, height: props.height };
  
  const rect = chartRef.value.getBoundingClientRect();
  return {
    width: props.width || rect.width || 800,
    height: typeof props.height === 'number' ? props.height : parseInt(props.height) || 300
  };
}

function createChart() {
  if (!chartRef.value || chart || !props.series.length) return;

  const { width, height } = getContainerSize();
  const data = transformSeries();
  
  if (!data || data.length === 0) return;

  const opts = {
    width,
    height,
    series: createSeriesConfig(),
    axes: createAxesConfig(),
    scales: createScalesConfig(),
    cursor: {
      drag: {
        x: true,
        y: false,
        dist: 10,
      },
      sync: {
        key: props.syncKey,
      },
    },
    legend: {
      show: true,
    },
    select: {
      show: true,
      left: 0,
      width: 0,
      top: 0,
      height: 0,
    },
    hooks: {
      setCursor: [
        (u) => {
          const { left, top, idx } = u.cursor;
          if (idx !== null && idx !== undefined) {
            // Get timestamp for the cursor position
            const timestamp = u.data[0][idx];
            const value = u.data[1] ? u.data[1][idx] : null;
            
            if (timestamp) {
              const date = new Date(timestamp * 1000);
              const options = { 
                hour12: false,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              };
              
              if (props.timezone) {
                options.timeZone = props.timezone;
              }
              
              emit("mouse-move", { 
                idx, 
                left, 
                top, 
                timestamp: date.toLocaleString(undefined, options),
                value: value,
                rawTimestamp: timestamp * 1000
              });
            }
          }
        },
      ],
      setData: [
        (u) => {
          emit("data-point-selection", u);
        },
      ],
      setSelect: [
        (u) => {
          const { left, top, width, height } = u.select;
          if (width > 10) {
            const leftVal = u.posToVal(left, 'x');
            const rightVal = u.posToVal(left + width, 'x');
            u.setScale('x', { min: leftVal, max: rightVal });
            emit("zoom-changed", { min: leftVal, max: rightVal });
          }
        },
      ],
    },
    ...props.options,
  };

  try {
    chart = new uPlot(opts, data, chartRef.value);
  } catch (error) {
    console.error("Error creating uPlot chart:", error);
  }
}

function transformSeries() {
  if (!props.series.length) return null;

  // Extract timestamps from first series
  const timestamps = props.series[0]?.data?.map(point => {
    let timestamp = point.x;
    
    // Handle different timestamp formats
    if (typeof timestamp === 'string') {
      // Parse ISO string or other date formats
      timestamp = new Date(timestamp).getTime();
    } else if (typeof timestamp === 'number') {
      // If it's already a timestamp, check if it's in milliseconds or seconds
      if (timestamp > 1e12) {
        // Likely milliseconds, keep as is
      } else if (timestamp > 1e9) {
        // Likely seconds, convert to milliseconds
        timestamp = timestamp * 1000;
      }
    }
    
    // Convert to seconds for uPlot (from milliseconds)
    return timestamp / 1000;
  }) || [];

  // Transform each series data
  const seriesData = props.series.map(series => 
    series.data?.map(point => {
      const value = parseFloat(point.y);
      return isNaN(value) ? null : value;
    }) || []
  );

  return [timestamps, ...seriesData];
}

function createSeriesConfig() {
  const baseConfig = [
    {}, // timestamps series
  ];

  props.series.forEach((series, index) => {
    const config = {
      label: series.name || `Series ${index + 1}`,
      stroke: getSeriesColor(index),
      width: 2,
      fill: "transparent",
      points: {
        show: true,
        size: 4,
        stroke: getSeriesColor(index),
        fill: "#fff",
      },
    };

    // If dual axis and this is the second series, use phase scale
    if (props.dualAxis && index === 1) {
      config.scale = "phase";
    }

    baseConfig.push(config);
  });

  return baseConfig;
}

function createAxesConfig() {
  const axes = [
    {
      scale: "x",
      space: 80,
      stroke: "#ffffff",
      grid: { stroke: "#4a5568", width: 1 },
      ticks: { stroke: "#ffffff", width: 1 },
      font: "12px system-ui",
      labelFont: "12px system-ui",
      values: (u, vals) => vals.map(v => {
        const date = new Date(v * 1000);
        
        // Smart formatting based on zoom range
        const range = u.scales.x.max - u.scales.x.min;
        const rangeMs = range * 1000;
        
        let options = { hour12: false };
        
        if (props.timezone) {
          options.timeZone = props.timezone;
        }
        
        // Less than 1 minute - show seconds
        if (rangeMs < 60000) {
          options = { ...options, hour: '2-digit', minute: '2-digit', second: '2-digit' };
        }
        // Less than 1 hour - show minutes
        else if (rangeMs < 3600000) {
          options = { ...options, hour: '2-digit', minute: '2-digit' };
        }
        // Less than 24 hours - show hours
        else if (rangeMs < 86400000) {
          options = { ...options, hour: '2-digit', minute: '2-digit' };
        }
        // More than 24 hours - show date and time
        else {
          options = { ...options, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        }
        
        return date.toLocaleString(undefined, options);
      }),
      splits: (u, axisIdx, scaleMin, scaleMax, foundIncr, foundSpace) => {
        // Smart tick distribution based on zoom range
        const range = scaleMax - scaleMin;
        const rangeMs = range * 1000;
        
        let step;
        if (rangeMs < 60000) {
          step = 5; // 5 seconds
        } else if (rangeMs < 300000) {
          step = 30; // 30 seconds
        } else if (rangeMs < 3600000) {
          step = 300; // 5 minutes
        } else if (rangeMs < 86400000) {
          step = 3600; // 1 hour
        } else {
          step = 86400; // 1 day
        }
        
        const splits = [];
        for (let i = Math.ceil(scaleMin / step) * step; i <= scaleMax; i += step) {
          splits.push(i);
        }
        return splits;
      },
    },
    {
      scale: "y",
      label: props.series[0]?.name || "Amplitude",
      labelSize: 30,
      space: 80,
      stroke: "#ffffff",
      grid: { stroke: "#4a5568", width: 1 },
      ticks: { stroke: "#ffffff", width: 1 },
      font: "12px system-ui",
      labelFont: "12px system-ui",
    },
  ];

  // Add second axis for dual axis charts
  if (props.dualAxis && props.series.length > 1) {
    axes.push({
      scale: "phase",
      label: props.series[1]?.name || "Phase (°)",
      labelSize: 30,
      side: 1,
      space: 80,
      stroke: "#ffffff",
      grid: { show: false },
      ticks: { stroke: "#ffffff", width: 1 },
      font: "12px system-ui",
      labelFont: "12px system-ui",
    });
  }

  return axes;
}

function createScalesConfig() {
  const scales = {
    x: {
      time: true, // Enable uPlot's built-in time support
      auto: true,
    },
    y: {
      auto: true,
    },
  };

  // Add phase scale for dual axis charts
  if (props.dualAxis) {
    scales.phase = {
      range: props.phaseRange,
      auto: false,
    };
  }

  return scales;
}

function getSeriesColor(index) {
  const colors = [
    "#3b82f6", // blue
    "#ef4444", // red
    "#10b981", // green
    "#f59e0b", // yellow
    "#8b5cf6", // purple
    "#06b6d4", // cyan
  ];
  return colors[index % colors.length];
}

function updateChart() {
  if (!chart) return;

  const data = transformSeries();
  if (!data) return;

  try {
    // Store current zoom state
    const currentScale = chart.scales.x;
    const isZoomed = currentScale.min !== null && currentScale.max !== null;
    
    chart.setData(data);
    
    // Restore zoom state if it was zoomed
    if (isZoomed) {
      chart.setScale('x', { min: currentScale.min, max: currentScale.max });
    }
  } catch (error) {
    console.error("Error updating uPlot chart:", error);
  }
}

function resizeChart() {
  if (!chart) return;

  const { width, height } = getContainerSize();
  chart.setSize({ width, height });
}

function destroyChart() {
  if (chart) {
    try {
      chart.destroy();
    } finally {
      chart = null;
    }
  }
}

// Expose methods to parent component
defineExpose({
  updateSeries: updateChart,
  resize: resizeChart,
  destroy: destroyChart,
  zoomTo: (min, max) => {
    if (chart) {
      chart.setScale('x', { min, max });
      emit("zoom-changed", { min, max });
    }
  },
  resetZoom: () => {
    if (chart && chart.data && chart.data[0]) {
      // Calculate full data range
      const timestamps = chart.data[0];
      const min = Math.min(...timestamps);
      const max = Math.max(...timestamps);
      console.log('Reset zoom:', { min, max, timestamps: timestamps.length });
      chart.setScale('x', { min, max });
      emit("zoom-changed", { min, max });
    } else {
      console.log('Reset zoom failed: chart or data not available');
    }
  },
});

onMounted(async () => {
  await nextTick();
  createChart();
  
  // Add resize listener
  window.addEventListener("resize", resizeChart);
});

onUnmounted(() => {
  destroyChart();
  window.removeEventListener("resize", resizeChart);
});

// Watch for changes in series data
watch(
  () => props.series,
  () => {
    if (chart) {
      updateChart();
    } else {
      createChart();
    }
  },
  { deep: true }
);

// Watch for size changes
watch(
  [() => props.width, () => props.height],
  () => {
    if (chart) {
      resizeChart();
    }
  }
);
</script>

<style scoped>
.uplot-chart {
  width: 100%;
  height: 100%;
  position: relative;
}

.uplot-chart :deep(.u-title) {
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 8px;
}

.uplot-chart :deep(.u-legend) {
  font-size: 12px;
  margin-top: 8px;
}

.uplot-chart :deep(.u-legend .u-marker) {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 4px;
}

.uplot-chart :deep(.u-axis) {
  font-size: 11px;
  fill: #ffffff;
}

.uplot-chart :deep(.u-axis text) {
  fill: #ffffff;
}

.uplot-chart :deep(.u-grid) {
  stroke: #4a5568;
  stroke-width: 1;
}

.uplot-chart :deep(.u-cursor-x),
.uplot-chart :deep(.u-cursor-y) {
  stroke: #cbd5e0;
  stroke-width: 1;
  stroke-dasharray: 3, 3;
}

.uplot-chart :deep(.u-select) {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid #3b82f6;
}

.uplot-chart :deep(.u-legend) {
  color: #ffffff;
}

.uplot-chart :deep(.u-legend .u-label) {
  color: #ffffff;
}
</style>
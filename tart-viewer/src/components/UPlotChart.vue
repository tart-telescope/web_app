<template>
  <div ref="chartRef" class="uplot-chart" />
</template>

<script setup>
  import uPlot from "uplot";
  import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
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
    resetZoomOnDataChange: {
      type: Boolean,
      default: false,
    },
    showLegend: {
      type: Boolean,
      default: false,
    },
    timeAxis: {
      type: Boolean,
      default: true,
    },
    yAxisLabel: {
      type: String,
      default: "",
    },
    xAxisLabel: {
      type: String,
      default: "",
    },
    showCursor: {
      type: Boolean,
      default: true,
    },
    emitEvents: {
      type: Boolean,
      default: true,
    },
    cursorFocus: {
      type: Boolean,
      default: false,
    },
  });

  const emit = defineEmits(["data-point-selection", "mouse-move", "mouse-leave", "zoom-changed"]);

  const chartRef = ref(null);
  let chart = null;
  let lastSeriesHash = null;

  function getContainerSize() {
    if (!chartRef.value) return { width: 800, height: props.height };

    const rect = chartRef.value.getBoundingClientRect();
    return {
      width: props.width || rect.width || 800,
      height: typeof props.height === 'number' ? props.height : Number.parseInt(props.height) || 300
    };
  }

  function createChart() {
    if (!chartRef.value || chart || props.series.length === 0) return;

    const { width, height } = getContainerSize();
    const data = transformSeries();

    if (!data || data.length === 0) return;

    // Cache series hash to avoid unnecessary updates
    lastSeriesHash = JSON.stringify(props.series);

    const opts = {
      width,
      height,
      series: createSeriesConfig(),
      axes: createAxesConfig(),
      scales: createScalesConfig(),
      cursor: {
        show: props.showCursor,
        drag: {
          x: true,
          y: false,
          dist: 10,
        },
        sync: {
          key: props.syncKey,
        },
        focus: props.cursorFocus ? {
          prox: 1e6,
        } : undefined,
        points: {
          show: props.cursorFocus,
          size: 6,
          width: 2,
          stroke: (u, seriesIdx) => u.series[seriesIdx].stroke(),
          fill: "#fff",
        },
        x: props.cursorFocus,
        y: props.cursorFocus,
      },
      focus: props.cursorFocus ? {
        alpha: 0.3,
      } : undefined,
      legend: {
        show: props.showLegend,
      },
      select: {
        show: true,
        left: 0,
        width: 0,
        top: 0,
        height: 0,
      },
      hooks: {
        ...(props.cursorFocus ? {
          setSeries: [
            (u, seriesIdx, opts) => {
              if (opts.focus != null) {
                for (const [i, s] of u.series.entries()) {
                  if (i > 0) { // Skip x-axis series
                    s.width = i == seriesIdx ? 3 : 1;
                  }
                }
              }
            }
          ]
        } : {}),
        setCursor: [
          (u) => {
            if (!props.emitEvents) return;

            const { left, top, idx } = u.cursor;
            if (idx !== null && idx !== undefined) {
              // Get x-axis value (could be timestamp, frequency, etc.)
              const xValue = u.data[0][idx];
              const yValue = u.data[1] ? u.data[1][idx] : null;

              // Get all y-values for all series at this x position
              const seriesValues = [];
              for (let i = 1; i < u.data.length; i++) {
                const seriesYValue = u.data[i] ? u.data[i][idx] : null;
                if (seriesYValue !== null && seriesYValue !== undefined) {
                  seriesValues.push({
                    seriesIndex: i - 1,
                    name: u.series[i].label || `Series ${i}`,
                    value: seriesYValue
                  });
                }
              }

              if (xValue !== null && xValue !== undefined) {
                // Check if this looks like a timestamp (Unix timestamp in seconds)
                const isTimestamp = xValue > 1_000_000_000 && xValue < 4_000_000_000;

                let formattedData = {
                  idx,
                  left,
                  top,
                  xValue: xValue,
                  yValue: yValue,
                  seriesValues: seriesValues
                };

                if (isTimestamp) {
                  // Add timestamp formatting for time series
                  const date = new Date(xValue * 1000);
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

                  formattedData.timestamp = date.toLocaleString(undefined, options);
                  formattedData.rawTimestamp = xValue * 1000;
                  formattedData.value = yValue; // backward compatibility
                }

                emit("mouse-move", formattedData);
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

      // Always focus on displayed data on initial chart creation
      focusOnDisplayedData(data);
    } catch (error) {
      console.error("Error creating uPlot chart:", error);
    }
  }

  function transformSeries() {
    if (props.series.length === 0) return null;

    // Extract x-axis values from first series
    const xValues = props.series[0]?.data?.map((point, idx) => {
      let xValue = point.x;
      const originalValue = xValue;

      if (props.timeAxis) {
        // Handle timestamp formatting only if this is a time axis
        if (typeof xValue === 'string') {
          // Parse ISO string or other date formats
          xValue = new Date(xValue).getTime();
        } else if (typeof xValue === 'number') {
          // If it's already a timestamp, check if it's in milliseconds or seconds
          if (xValue > 1e12) {
            // Likely milliseconds, keep as is
          } else if (xValue > 1e9) {
            // Likely seconds, convert to milliseconds
            xValue = xValue * 1000;
          }
        }

        // Debug logging for first few timestamps
        if (idx < 3) {
          console.log(`Timestamp ${idx}:`, {
            original: originalValue,
            processed: xValue,
            date: new Date(xValue).toISOString(),
            uplotValue: xValue / 1000
          });
        }

        // Convert to seconds for uPlot (from milliseconds)
        return xValue / 1000;
      } else {
        // For non-time data (like frequency), use values as-is
        return typeof xValue === 'number' ? xValue : Number.parseFloat(xValue) || 0;
      }
    }) || [];

    // Transform each series data
    const seriesData = props.series.map(series =>
      series.data?.map(point => {
        const value = Number.parseFloat(point.y);
        return Number.isNaN(value) ? null : value;
      }) || []
    );

    return [xValues, ...seriesData];
  }

  function createSeriesConfig() {
    const baseConfig = [
      {}, // timestamps series
    ];

    for (const [index, series] of props.series.entries()) {
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
    }

    return baseConfig;
  }

  function createAxesConfig() {
    const xAxisConfig = {
      scale: "x",
      space: 80,
      stroke: "#ffffff",
      grid: { stroke: "#4a5568", width: 1 },
      ticks: { stroke: "#ffffff", width: 1 },
      font: "12px system-ui",
      labelFont: "12px system-ui",
      label: props.xAxisLabel || "",
      labelSize: props.xAxisLabel ? 30 : 0,
    };

    if (props.timeAxis) {
      // Time axis configuration
      xAxisConfig.values = (u, vals) => vals.map(v => {
        const date = new Date(v * 1000);

        // Smart formatting based on zoom range
        const range = u.scales.x.max - u.scales.x.min;
        const rangeMs = range * 1000;

        let options = { hour12: false };

        if (props.timezone) {
          options.timeZone = props.timezone;
        }

        // Less than 1 minute - show seconds
        if (rangeMs < 60_000) {
          options = { ...options, hour: '2-digit', minute: '2-digit', second: '2-digit' };
        }
        // Less than 1 hour - show minutes
        else if (rangeMs < 3_600_000) {
          options = { ...options, hour: '2-digit', minute: '2-digit' };
        }
        // Less than 24 hours - show hours
        else if (rangeMs < 86_400_000) {
          options = { ...options, hour: '2-digit', minute: '2-digit' };
        }
        // More than 24 hours - show date and time
        else {
          options = { ...options, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        }

        return date.toLocaleString(undefined, options);
      });

      xAxisConfig.splits = (u, axisIdx, scaleMin, scaleMax, foundIncr, foundSpace) => {
        // Smart tick distribution based on zoom range
        const range = scaleMax - scaleMin;
        const rangeMs = range * 1000;

        let step;
        if (rangeMs < 60_000) {
          step = 5; // 5 seconds
        } else if (rangeMs < 300_000) {
          step = 30; // 30 seconds
        } else if (rangeMs < 3_600_000) {
          step = 300; // 5 minutes
        } else if (rangeMs < 86_400_000) {
          step = 3600; // 1 hour
        } else {
          step = 86_400; // 1 day
        }

        const splits = [];
        const startTime = Math.floor(scaleMin / step) * step;
        for (let t = startTime; t <= scaleMax; t += step) {
          if (t >= scaleMin) splits.push(t);
        }
        return splits;
      };
    } else {
      // Non-time axis configuration (frequency, etc.)
      xAxisConfig.values = (u, vals) => vals.map(v => v.toFixed(2));

      xAxisConfig.splits = (u, axisIdx, scaleMin, scaleMax) => {
        const range = scaleMax - scaleMin;
        if (range === 0) return [scaleMin - 0.1, scaleMax + 0.1];

        const step = range / 6; // Aim for ~6 ticks
        const splits = [];
        for (let i = 0; i <= 6; i++) {
          splits.push(scaleMin + (i * step));
        }
        return splits;
      };
    }

    const axes = [xAxisConfig,
                  {
                    scale: "y",
                    label: props.yAxisLabel || props.series[0]?.name || "Amplitude",
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
        values: (u, vals) => vals.map(v => v.toFixed(0) + '°'),
      });
    }

    return axes;
  }

  function createScalesConfig() {
    const scales = {
      x: {
        time: props.timeAxis, // Enable uPlot's built-in time support only for time data
        auto: true,
      },
      y: {
        auto: true,
        range: (u, dataMin, dataMax) => {
          // Ensure at least 2 ticks on amplitude axis
          const range = dataMax - dataMin;
          if (range === 0) {
            return [dataMin - 0.1, dataMax + 0.1];
          }
          return [dataMin, dataMax];
        },
      },
    };

    // Add phase scale for dual axis charts
    if (props.dualAxis) {
      scales.phase = {
        range: [-180, 180],
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

    // Check if series actually changed to avoid unnecessary updates
    const currentSeriesHash = JSON.stringify(props.series);
    if (currentSeriesHash === lastSeriesHash) return;

    const data = transformSeries();
    if (!data) return;

    try {
      // Store current zoom state
      const currentScale = chart.scales.x;
      const dataRange = { min: Math.min(...data[0]), max: Math.max(...data[0]) };

      // Debug: log data range calculation
      console.log('Data range calculation:', {
        dataMin: dataRange.min,
        dataMax: dataRange.max,
        dataCount: data[0].length,
        currentScaleMin: currentScale.min,
        currentScaleMax: currentScale.max,
        firstTimestamp: data[0][0],
        lastTimestamp: data[0].at(-1)
      });

      // Check if zoom is valid (not too far from actual data range)
      const maxAllowedRange = (dataRange.max - dataRange.min) * 10; // Allow 10x the actual data range
      const isValidZoom = currentScale.min !== null && currentScale.max !== null &&
        currentScale.min >= dataRange.min - maxAllowedRange &&
        currentScale.max <= dataRange.max + maxAllowedRange;

      const isZoomed = isValidZoom &&
        (Math.abs(currentScale.min - dataRange.min) > 1 || Math.abs(currentScale.max - dataRange.max) > 1);

      chart.setData(data);
      lastSeriesHash = currentSeriesHash;

      // Restore zoom state if it was zoomed and resetZoomOnDataChange is false
      if (isZoomed && !props.resetZoomOnDataChange) {
        chart.setScale('x', { min: currentScale.min, max: currentScale.max });
        logZoomChange('Preserving zoom', currentScale.min, currentScale.max);
      } else {
        // Reset zoom when data changes, invalid zoom, or not previously zoomed
        const reason = isValidZoom ? (props.resetZoomOnDataChange ? 'telescope change' : 'not zoomed') : 'invalid zoom range';
        focusOnDisplayedData(data, { resetFlag: props.resetZoomOnDataChange, wasZoomed: isZoomed, reason });
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
        lastSeriesHash = null;
      }
    }
  }

  // Helper function to focus on displayed data
  function focusOnDisplayedData(data, logContext = {}) {
    const timestamps = data[0];
    const validTimestamps = timestamps.filter(t => t != null && !Number.isNaN(t));
    if (validTimestamps.length > 0) {
      let min = Math.min(...validTimestamps);
      let max = Math.max(...validTimestamps);

      // Handle duplicate timestamps by adding a small buffer
      if (min === max) {
        const buffer = 30; // 30 seconds buffer
        min = min - buffer;
        max = max + buffer;
        logContext.duplicateTimestamps = true;
      }

      logZoomChange('Focusing on data', min, max, logContext);
      chart.setScale('x', { min, max });
      emit("zoom-changed", { min, max });
    }
  }

  // Helper function to log zoom changes
  function logZoomChange(action, min, max, context = {}) {
    const minDate = new Date(min * 1000);
    const maxDate = new Date(max * 1000);
    console.log(`${action}:`, {
      min, max,
      minTime: minDate.toISOString() + ' (UTC)',
      maxTime: maxDate.toISOString() + ' (UTC)',
      timezone: 'UTC',
      ...context
    });
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
        focusOnDisplayedData(chart.data, { action: 'reset' });
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
    if (updateTimeout) clearTimeout(updateTimeout);
    destroyChart();
    window.removeEventListener("resize", resizeChart);
  });

  // Watch for changes in series data (5ms debounce for performance)
  let updateTimeout = null;
  watch(
    () => props.series,
    () => {
      if (updateTimeout) clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        if (chart) {
          updateChart();
        } else {
          createChart();
        }
      }, 5);
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
  stroke: #ffffff;
}

.uplot-chart :deep(.u-axis text) {
  fill: #ffffff;
}

.uplot-chart :deep(.u-axis line) {
  stroke: #ffffff;
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

/* Prevent stuck selection box artifacts */
.uplot-chart :deep(.u-select:not(.u-select--active)) {
  display: none !important;
}

.uplot-chart :deep(.u-axis-y .u-tick) {
  stroke: #ffffff;
}

/* Fix cursor artifacts in top-left corner */
.uplot-chart :deep(.u-cursor-x),
.uplot-chart :deep(.u-cursor-y) {
  display: none;
}

.uplot-chart :deep(.u-cursor-x.u-cursor-x--show),
.uplot-chart :deep(.u-cursor-y.u-cursor-y--show) {
  display: block;
}

/* Hide any stuck cursor elements */
.uplot-chart :deep(.u-cursor-pt) {
  display: none !important;
}

.uplot-chart :deep(.u-legend) {
  color: #ffffff;
}

.uplot-chart :deep(.u-legend .u-label) {
  color: #ffffff;
}
</style>

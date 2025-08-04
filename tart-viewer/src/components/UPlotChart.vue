<template>
  <div class="uplot-chart">
    <UplotVue
      :data="chartData"
      :options="chartOptions"
      @create="onChartCreate"
      @delete="onChartDelete"
    />
  </div>
</template>

<script setup>
  import uPlot from "uplot";
  import UplotVue from "uplot-vue";
  import { computed, ref } from "vue";
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
    showLegend: {
      type: Boolean,
      default: false,
    },
    showCursor: {
      type: Boolean,
      default: true,
    },
    timeAxis: {
      type: Boolean,
      default: true,
    },
    syncKey: {
      type: String,
      default: null,
    },
    timezone: {
      type: String,
      default: undefined,
    },
    resetZoomOnDataChange: {
      type: Boolean,
      default: false,
    },
    cursorFocus: {
      type: Boolean,
      default: false,
    },
    emitEvents: {
      type: Boolean,
      default: true,
    },
    xAxisLabel: {
      type: String,
      default: "",
    },
    yAxisLabel: {
      type: String,
      default: "",
    },
  });

  const emit = defineEmits(["data-point-selection", "mouse-move", "mouse-leave", "zoom-changed"]);

  const chart = ref(null);

  const chartData = computed(() => {
    if (!props.series?.length) return [];

    const xValues = transformXValues(props.series[0]?.data || []);
    const seriesData = props.series.map(transformYValues);

    return [xValues, ...seriesData];
  });

  function transformXValues(data) {
    return data.map(point => {
      let xValue = point.x;

      if (props.timeAxis) {
        xValue = normalizeTimestamp(xValue);
        return xValue / 1000; // Convert to seconds for uPlot
      }

      return typeof xValue === 'number' ? xValue : Number.parseFloat(xValue) || 0;
    });
  }

  function transformYValues(series) {
    return series.data?.map(point => {
      const value = Number.parseFloat(point.y);
      return Number.isNaN(value) ? null : value;
    }) || [];
  }

  function normalizeTimestamp(value) {
    if (typeof value === 'string') {
      return new Date(value).getTime();
    }

    if (typeof value === 'number') {
      // Convert seconds to milliseconds if needed
      return value > 1e12 ? value : (value > 1e9 ? value * 1000 : value);
    }

    return value;
  }

  const chartOptions = computed(() => {
    const height = typeof props.height === 'number' ? props.height : Number.parseInt(props.height) || 300;

    const options = {
      width: props.width || 800,
      height,
      ms: 1, // uPlot expects timestamps in seconds
      series: [
        {}, // x-axis
        ...props.series.map((serie, i) => ({
          label: serie.label || serie.name || `Series ${i + 1}`,
          stroke: serie.color || getColor(i),
          width: serie.width || 2,
        }))
      ],
      axes: [
        {
          stroke: "#ffffff",
          grid: { stroke: "#4a5568", width: 1 },
          ticks: { stroke: "#ffffff", width: 1 },
          font: "12px system-ui",
          labelFont: "12px system-ui",
          values: props.timeAxis ? (u, vals) => vals.map(v => {
            const date = new Date(v * 1000);
            return date.toLocaleString(undefined, { 
              hour12: false,
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit'
            }).split(' ')[1] || date.toLocaleTimeString();
          }) : (u, vals) => vals.map(v => v.toFixed(2)),
          label: props.xAxisLabel,
          labelSize: props.xAxisLabel ? 30 : 0,
        },
        {
          stroke: "#ffffff",
          grid: { stroke: "#4a5568", width: 1 },
          ticks: { stroke: "#ffffff", width: 1 },
          font: "12px system-ui",
          labelFont: "12px system-ui",
          label: props.yAxisLabel,
          labelSize: props.yAxisLabel ? 30 : 0,
        },
      ],
      legend: {
        show: props.showLegend,
      },
      cursor: {
        show: props.showCursor,
        sync: props.syncKey ? { key: props.syncKey } : undefined,
        focus: props.cursorFocus ? { prox: 10 } : undefined,
        points: {
          show: true,
          size: 6,
          width: 2,
          stroke: "#ffffff",
          fill: "#ffffff",
        },
      },
      scales: {
        x: { time: props.timeAxis },
      },
      ...(props.timezone && props.timeAxis ? {
        tzDate: ts => uPlot.tzDate(new Date(ts * 1000), props.timezone)
      } : {}),
      hooks: props.emitEvents ? {
        setSelect: [
          (u) => {
            const sel = u.select;
            if (sel.width > 0) {
              const min = u.posToVal(sel.left, 'x');
              const max = u.posToVal(sel.left + sel.width, 'x');
              u.setScale('x', { min, max });
              emit("zoom-changed", { min, max });
            }
          }
        ],
        setCursor: [
          (u) => {
            if (u.cursor.idx === null) {
              emit("mouse-leave");
            } else {
              const xValue = u.data[0][u.cursor.idx];
              const eventData = {
                idx: u.cursor.idx,
                left: u.cursor.left,
                top: u.cursor.top,
                xValue: xValue,
              };
            
              // Only add timestamp formatting for time axis
              if (props.timeAxis && xValue > 1_000_000_000 && xValue < 4_000_000_000) {
                const date = new Date(xValue * 1000);
                const options = { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
                if (props.timezone) options.timeZone = props.timezone;
                eventData.timestamp = date.toLocaleString(undefined, options);
              }
            
              emit("mouse-move", eventData);
            }
          }
        ],
      } : {},
      ...props.options,
    };

    return options;
  });

  function getColor(index) {
    const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];
    return colors[index % colors.length];
  }

  function onChartCreate(chartInstance) {
    chart.value = chartInstance;
  }

  function onChartDelete() {
    chart.value = null;
  }

  function resetZoom() {
    if (chart.value) {
      chart.value.setScale('x', { min: null, max: null });
    }
  }

  defineExpose({
    chart,
    resetZoom,
  });
</script>

<style scoped>
.uplot-chart {
  width: 100%;
}
</style>

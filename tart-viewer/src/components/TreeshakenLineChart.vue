<template>
  <div ref="chartRef" class="treeshaken-line-chart" />
</template>

<script setup>
  import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

  let ApexCharts;
  let chartCounter = 0;

  const props = defineProps({
    series: {
      type: Array,
      default: () => [],
    },
    options: {
      type: Object,
      default: () => ({}),
    },
    height: {
      type: [String, Number],
      default: 160,
    },
  });

  const emit = defineEmits(["data-point-selection", "mouse-move", "mouse-leave"]);

  const chartRef = ref(null);
  let chart = null;
  const chartId = `chart-${++chartCounter}`;

  async function loadApexCharts() {
    if (!ApexCharts) {
      const { default: ApexChartsClass } = await import("apexcharts");
      ApexCharts = ApexChartsClass;
    }
    return ApexCharts;
  }

  async function createChart() {
    if (!chartRef.value || chart) return;

    try {
      const ApexChartsClass = await loadApexCharts();

      const chartOptions = {
        chart: {
          id: chartId,
          type: "line",
          height: props.height,
          toolbar: { show: false },
          animations: { enabled: false },
          events: {
            dataPointSelection: (event, chartContext, config) =>
              emit("data-point-selection", event, chartContext, config),
            mouseMove: (event, chartContext, config) =>
              emit("mouse-move", event, chartContext, config),
            mouseLeave: (event, chartContext, config) =>
              emit("mouse-leave", event, chartContext, config),
          },
          ...props.options.chart,
        },
        series: props.series,
        ...props.options,
      };

      chart = new ApexChartsClass(chartRef.value, chartOptions);
      await chart.render();
    } catch (error) {
      console.error("Error creating chart:", error);
    }
  }

  async function updateChart() {
    if (!chart) return;

    try {
      await chart.updateOptions({
        ...props.options,
        series: props.series,
      });
    } catch (error) {
      console.error("Error updating chart:", error);
    }
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

  // Essential methods only
  defineExpose({
    updateSeries: (series) => chart?.updateSeries(series),
    destroy: destroyChart,
  });

  onMounted(async () => {
    await nextTick();
    await createChart();
  });

  onUnmounted(destroyChart);

  // Single watcher for all changes
  watch([() => props.series, () => props.options], updateChart, {
    deep: true,
    flush: "post",
  });
</script>

<style scoped>
.treeshaken-line-chart {
  width: 100%;
  height: 100%;
}
</style>

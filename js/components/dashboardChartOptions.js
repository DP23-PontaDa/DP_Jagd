window.DashboardChartOptions = (() => {
  const EVENTS = ["mousemove", "mouseout", "click", "touchstart", "touchmove"];

  function standardLabel(context) {
    const label = context.dataset?.label || "Wert";
    const wert = context.formattedValue ?? context.raw ?? 0;
    return `${label}: ${wert}`;
  }

  function withTooltip(options = {}) {
    const plugins = options.plugins || {};
    const bisher = plugins.tooltip || {};
    const callbacks = bisher.callbacks || {};
    return {
      ...options,
      events: EVENTS,
      interaction: {
        mode: "nearest",
        intersect: true,
        axis: options.indexAxis === "y" ? "y" : "x",
        ...(options.interaction || {}),
        // Ein Tooltip soll nur am tatsächlich berührten Balken erscheinen.
        mode: "nearest",
        intersect: true,
      },
      hover: {
        mode: "nearest",
        intersect: true,
        ...(options.hover || {}),
      },
      plugins: {
        ...plugins,
        tooltip: {
          enabled: true,
          position: "nearest",
          mode: "nearest",
          intersect: true,
          ...bisher,
          callbacks: {
            title: (items) => items[0]?.label || "",
            label: standardLabel,
            ...callbacks,
          },
        },
      },
    };
  }

  return { withTooltip };
})();

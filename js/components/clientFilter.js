window.ClientFilter = (() => {
  function normalize(value) {
    return String(value ?? "").toLocaleLowerCase("de").trim();
  }

  function values(item, getter) {
    const value = getter(item);
    return Array.isArray(value) ? value : [value];
  }

  function filter(items, config) {
    const search = normalize(config.search);
    const predicates = config.predicates || [];

    return (items || []).filter((item) => {
      if (
        search &&
        !(config.searchFields || []).some((getter) =>
          values(item, getter).some((value) => normalize(value).includes(search)),
        )
      ) {
        return false;
      }

      return predicates.every((predicate) => predicate(item));
    });
  }

  function uniqueOptions(items, valueGetter, labelGetter, compare) {
    const options = new Map();
    (items || []).forEach((item) => {
      const value = valueGetter(item);
      if (value == null || value === "") return;
      const key = String(value);
      if (!options.has(key)) {
        options.set(key, {
          value: key,
          label: String(labelGetter ? labelGetter(item) : value),
        });
      }
    });
    const result = Array.from(options.values());
    return compare ? result.sort(compare) : result;
  }

  return { filter, normalize, uniqueOptions };
})();

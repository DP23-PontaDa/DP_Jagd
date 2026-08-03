const WildklasseColors = (() => {
  const namedColors = {
    "rotwild|hirsch i": "--wildklasse-rw-hirsch-1",
    "rotwild|hirsch ii": "--wildklasse-rw-hirsch-2",
    "rotwild|hirsch iii": "--wildklasse-rw-hirsch-3",
    "rotwild|hirsch iv": "--wildklasse-rw-hirsch-4",
    "rotwild|alttier": "--wildklasse-rw-alttier",
    "rotwild|schmaltier": "--wildklasse-rw-schmaltier",
    "rotwild|kalb": "--wildklasse-rw-kalb",
    "rehwild|bock i": "--wildklasse-re-bock-1",
    "rehwild|bock ii": "--wildklasse-re-bock-2",
    "rehwild|geiß": "--wildklasse-re-geiss",
    "rehwild|geiss": "--wildklasse-re-geiss",
    "rehwild|schmalreh": "--wildklasse-re-schmalreh",
    "rehwild|kitz": "--wildklasse-re-kitz",
    "gamswild|bock": "--wildklasse-ga-bock",
    "gamswild|geiß": "--wildklasse-ga-geiss",
    "gamswild|geiss": "--wildklasse-ga-geiss",
    "gamswild|jährling": "--wildklasse-ga-jaehrling",
    "gamswild|jaehrling": "--wildklasse-ga-jaehrling",
    "gamswild|kitz": "--wildklasse-ga-kitz",
  };

  const groupColors = {
    rotwild: "--wild-rotwild",
    rehwild: "--wild-rehwild",
    gamswild: "--wild-gamswild",
    raubwild: "--wild-raubwild",
  };

  const raubwildColors = [
    "--wildklasse-raubwild-1",
    "--wildklasse-raubwild-2",
    "--wildklasse-raubwild-3",
    "--wildklasse-raubwild-4",
  ];

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("de");
  }

  function cssColor(variable) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(variable)
      .trim();
  }

  function fallbackColor(wildgruppe, wildklasse) {
    const key = `${normalize(wildgruppe)}|${normalize(wildklasse)}`;
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
      hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
    }
    if (normalize(wildgruppe) === "raubwild") {
      return cssColor(raubwildColors[Math.abs(hash) % raubwildColors.length]);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 48% 45%)`;
  }

  function get(wildgruppe, wildklasse) {
    const key = `${normalize(wildgruppe)}|${normalize(wildklasse)}`;
    const variable = namedColors[key];
    return variable ? cssColor(variable) : fallbackColor(wildgruppe, wildklasse);
  }

  function getGroup(wildgruppe) {
    const variable = groupColors[normalize(wildgruppe)];
    return variable ? cssColor(variable) : fallbackColor(wildgruppe, wildgruppe);
  }

  return {
    get,
    getGroup,
    variables: { ...namedColors },
  };
})();

window.WildklasseColors = WildklasseColors;

from enum import StrEnum


class Source(StrEnum):
    LIVE = "LIVE"
    ESTIMATED = "ESTIMATED"
    SIMULATED = "SIMULATED"
    CACHED = "CACHED"


FACTOR_SET_VERSION = "india-grid-v1"
CITATION_NOTE = "CEA India grid emission factor baseline (~700 gCO2/kWh); configurable demo assumption."

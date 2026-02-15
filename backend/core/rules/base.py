# core/rules/base.py
from abc import ABC, abstractmethod

class BaseRule(ABC):
    """
    Base rule interface. Each rule receives (transaction, ctx) and returns
    either None or a dict describing the anomaly.
    ctx: dict with useful lookups (like tank, station, recent_txns).
    """
    slug = "base"
    name = "Base Rule"
    description = "Abstract rule"
    default_config = {}

    def __init__(self, config=None):
        cfg = config or {}
        self.config = {**self.default_config, **cfg}

    @abstractmethod
    def evaluate(self, transaction, ctx):
        """
        Return None if OK, or dict with anomaly fields: { 'severity': 'warning', 'score': 0.5, 'details': {...} }
        """
        pass

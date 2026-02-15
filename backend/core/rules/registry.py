# backend/core/rules/registry.py
RULE_REGISTRY = {}

def register_rule(rule_cls):
    """
    rule_cls must be subclass of RuleBase and define slug attribute
    """
    slug = getattr(rule_cls, "slug", None)
    if not slug:
        raise ValueError("Rule class must define 'slug'")
    RULE_REGISTRY[slug] = rule_cls

def get_rule_registry():
    return RULE_REGISTRY

class RuleBase:
    """Base class for rules. Subclasses implement evaluate(transaction, rule_config)"""
    slug = None
    name = "Base rule"
    description = "Base"

    def __init__(self, rule_row):
        # rule_row is the DB Rule object (can access config)
        self.rule = rule_row
        self.config = rule_row.config or {}

    def evaluate(self, transaction):
        """
        Evaluate transaction. Return list of anomaly dicts or empty list.
        Each anomaly dict should contain: severity, details, score (optional).
        """
        raise NotImplementedError

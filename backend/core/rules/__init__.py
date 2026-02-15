# core/rules/__init__.py
from importlib import import_module
from django.apps import apps
from .base import BaseRule

# Static registry for built-in rule classes (fallback)
_BUILTIN = {
    "under_dispense": "core.rules.under_dispense.UnderDispenseRule",
    "tank_mismatch": "core.rules.tank_mismatch.TankMismatchRule",
}

def load_rule_class(rule_type_slug):
    """
    Returns class for slug. First try dynamic import by mapping, otherwise error.
    """
    path = _BUILTIN.get(rule_type_slug)
    if not path:
        raise ImportError(f"No rule class registered for {rule_type_slug}")
    modname, clsname = path.rsplit(".",1)
    mod = import_module(modname)
    return getattr(mod, clsname)

def build_enabled_rules():
    """
    Read Rule objects in DB and instantiate enabled rules.
    Returns list of (rule_obj, rule_instance).
    """
    RuleModel = apps.get_model("core","Rule")
    enabled = RuleModel.objects.filter(enabled=True)
    result = []
    for r in enabled:
        try:
            cls = load_rule_class(r.rule_type)
            inst = cls(config=r.config)
            result.append((r, inst))
        except Exception as e:
            # skip broken rule but log
            print(f"[rules] failed to load rule {r.slug}: {e}")
    return result

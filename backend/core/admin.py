from django.contrib import admin
from .models import User, Profile, Station, Pump, Tank, Transaction, Receipt, AuditLog, Rule, Anomaly

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('id','username','email','is_staff')

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('id','user','role','station')

admin.site.register(Station)
admin.site.register(Pump)
admin.site.register(Tank)
admin.site.register(Transaction)
admin.site.register(Receipt)
admin.site.register(AuditLog)
admin.site.register(Rule)
admin.site.register(Anomaly)

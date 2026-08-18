import NotificationListScreen from "../../src/components/NotificationListScreen";

export default function SuperAdminNotificationsScreen() {
  return (
    <NotificationListScreen
      backTo="/superadmin"
      title="Notifications"
      subtitle="Registrations, payments and subscription reminders"
    />
  );
}

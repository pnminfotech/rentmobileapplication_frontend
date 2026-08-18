import NotificationListScreen from "../../src/components/NotificationListScreen";

export default function SystemNotificationsScreen() {
  return (
    <NotificationListScreen
      backTo="/system"
      title="Notifications"
      subtitle="Subscription, payment and system reminders"
      variant="system"
    />
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-6 py-16 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose prose-invert text-text-muted space-y-4 text-sm leading-relaxed">
        <p>Last updated: July 2026</p>
        <p>
          Dheerendra Intelligence collects account information (email) and optional Telegram chat IDs for alert
          delivery. We do not sell your personal data to third parties.
        </p>
        <p>
          Market data is fetched from public APIs (e.g., Binance) and processed server-side. Chat
          messages sent to the Copilot are processed to generate responses but are not used for
          advertising purposes.
        </p>
        <p>
          For data deletion requests, contact support@deepcurrent.ai.
        </p>
      </div>
    </div>
  );
}

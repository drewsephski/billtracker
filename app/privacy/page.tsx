import { LegalPage } from "@/components/legal-page";

export const metadata = {
  title: "Privacy Policy",
  description: "How Homeshare handles your information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="A plain-language overview of the information Homeshare uses to help households coordinate bills. Effective September 21, 2026."
    >
      <h2>Information we collect</h2>
      <p>Depending on how you use Homeshare, we may collect:</p>
      <ul>
        <li>
          Account details such as your name, email address, profile image, and
          sign-in method.
        </li>
        <li>
          Household information such as bills, due dates, shares, contributions,
          invitations, and activity notes.
        </li>
        <li>
          Messages, drafts, and attachments that you choose to submit to
          household activity features.
        </li>
        <li>
          Basic technical information needed to operate and protect the service,
          such as session cookies, device/browser details, and security logs.
        </li>
      </ul>

      <h2>How we use information</h2>
      <p>We use information to:</p>
      <ul>
        <li>Provide sign-in, household, bill, and invitation features.</li>
        <li>Show the right information to the right household members.</li>
        <li>Secure, troubleshoot, maintain, and improve Homeshare.</li>
        <li>Respond to support requests and important service notices.</li>
      </ul>
      <p>
        We do not sell your personal information. We do not use your household
        bill data to make lending, credit, or insurance decisions.
      </p>

      <h2>Google sign-in</h2>
      <p>
        If you choose Google sign-in, Google provides us with information such
        as your name, email address, profile image, and a provider account
        identifier. Homeshare does not receive your Google password. We use
        verified email information to sign you into the matching Homeshare
        account when account linking is supported.
      </p>

      <h2>When information is shared</h2>
      <p>
        Your household information is visible to members of the household in
        accordance with the app’s permissions. We may also use infrastructure
        and service providers that process information for us, such as hosting,
        database, authentication, email, and optional activity-processing
        providers. They may use information only to provide services to us. We
        may disclose information when required by law or when necessary to
        protect Homeshare, our users, or the public.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We keep information while your account or household needs it and for a
        reasonable period afterward for security, legal, and operational
        purposes. You can ask us to delete your account and associated personal
        information by contacting us. Some records may remain where the law
        requires or where they are needed to resolve disputes and protect the
        service.
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable administrative, technical, and organizational
        safeguards. No online service is completely secure, so please use a
        unique password and tell us promptly if you believe your account has
        been accessed improperly.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or privacy requests can be sent to{" "}
        <a href="mailto:hello@homeshare.dev">hello@homeshare.dev</a>.
      </p>
    </LegalPage>
  );
}

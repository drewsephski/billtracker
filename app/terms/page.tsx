import { LegalPage } from "@/components/legal-page";

export const metadata = {
  title: "Terms of Service",
  description: "The terms for using Homeshare.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="A simple agreement for using Homeshare to keep shared household bills organized. Effective September 21, 2026."
    >
      <h2>Using Homeshare</h2>
      <p>
        Homeshare helps households track bills, shares, due dates, and
        contributions. By creating an account or using the service, you agree to
        these terms.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your account information accurate and protect your sign-in
        credentials. You are responsible for activity under your account. You
        may sign in with email and password or with Google when that option is
        available.
      </p>

      <h2>Household information</h2>
      <p>
        Information you add to a household is shared with that household’s
        members according to the permissions shown in the app. Only add bills,
        payment notes, names, and other information that you are allowed to
        share with those people.
      </p>

      <h2>What Homeshare is not</h2>
      <p>
        Homeshare is a tracking and coordination tool, not a bank, payment
        processor, escrow service, accounting service, or financial adviser.
        Recording a contribution in Homeshare does not move money or prove that
        a payment was completed outside the app. You are responsible for
        checking amounts and settling payments with your household.
      </p>

      <h2>Activity suggestions</h2>
      <p>
        Some features may suggest draft activity summaries from information you
        provide. Suggestions can be incomplete or wrong. Review and edit them
        before confirming anything; they do not change bills, payments, or
        permissions on their own.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not misuse Homeshare, attempt to access another person’s account,
        interfere with the service, or use it for unlawful or fraudulent
        activity. We may suspend access when necessary to protect users or the
        service.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We work to keep Homeshare available and accurate, but the service may
        change or be temporarily unavailable. We may update these terms as the
        product changes. If a change is material, we will provide notice in the
        service when practical.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms can be sent to{" "}
        <a href="mailto:hello@homeshare.dev">hello@homeshare.dev</a>.
      </p>
    </LegalPage>
  );
}

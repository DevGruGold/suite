import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold">Privacy Policy</CardTitle>
            <p className="text-sm text-muted-foreground">
              Last Updated: December 30, 2024
            </p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <h2>1. Introduction</h2>
            <p>
              Suite ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI executive platform and services.
            </p>

            <h2>2. Information We Collect</h2>
            <h3>2.1 Information You Provide</h3>
            <ul>
              <li><strong>Account Information:</strong> Name, email address, and authentication credentials when you create an account</li>
              <li><strong>Profile Information:</strong> Optional information such as company name, job title, and professional details</li>
              <li><strong>Communications:</strong> Messages, feedback, and correspondence with our AI executives and support team</li>
              <li><strong>Payment Information:</strong> Billing details processed securely through third-party payment processors</li>
            </ul>

            <h3>2.2 Automatically Collected Information</h3>
            <ul>
              <li><strong>Usage Data:</strong> Information about how you interact with our services, including features used and time spent</li>
              <li><strong>Device Information:</strong> Browser type, operating system, IP address, and device identifiers</li>
              <li><strong>Cookies and Similar Technologies:</strong> We use cookies to enhance user experience and analyze usage patterns</li>
            </ul>

            <h2>3. How We Use Your Information</h2>
            <p>We use collected information for the following purposes:</p>
            <ul>
              <li>Provide, maintain, and improve our AI executive services</li>
              <li>Process transactions and send related information</li>
              <li>Respond to your comments, questions, and requests</li>
              <li>Send administrative information, updates, and security alerts</li>
              <li>Monitor and analyze trends, usage, and activities</li>
              <li>Detect, prevent, and address technical issues and fraudulent activity</li>
              <li>Personalize and improve your experience with our AI executives</li>
              <li>Comply with legal obligations and enforce our terms</li>
            </ul>

            <h2>4. Data Sharing and Disclosure</h2>
            <p>We may share your information in the following circumstances:</p>
            <ul>
              <li><strong>With Your Consent:</strong> When you explicitly authorize us to share information</li>
              <li><strong>Service Providers:</strong> Third-party vendors who perform services on our behalf (e.g., hosting, analytics)</li>
              <li><strong>Business Transfers:</strong> In connection with mergers, acquisitions, or asset sales</li>
              <li><strong>Legal Requirements:</strong> When required by law, court order, or governmental request</li>
              <li><strong>Protection of Rights:</strong> To protect our rights, property, safety, or that of our users</li>
            </ul>
            <p>We do NOT sell your personal information to third parties.</p>

            <h2>5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your information, including:
            </p>
            <ul>
              <li>Encryption of data in transit and at rest</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Access controls and authentication mechanisms</li>
              <li>Secure data storage with Supabase and Google Cloud infrastructure</li>
            </ul>
            <p>
              However, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security.
            </p>

            <h2>6. Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. When we no longer need your information, we will securely delete or anonymize it.
            </p>

            <h2>7. Your Rights and Choices</h2>
            <p>Depending on your location, you may have the following rights:</p>
            <ul>
              <li><strong>Access:</strong> Request access to your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong>Opt-Out:</strong> Opt-out of marketing communications</li>
              <li><strong>Withdraw Consent:</strong> Withdraw consent where processing is based on consent</li>
            </ul>
            <p>
              To exercise these rights, please contact us at{" "}
              <a href="mailto:xmrtsolutions@gmail.com">xmrtsolutions@gmail.com</a>
            </p>

            <h2>8. Cookies and Tracking Technologies</h2>
            <p>
              We use cookies and similar tracking technologies to collect and track information and improve our services. You can control cookies through your browser settings. Disabling cookies may limit certain features of our service.
            </p>

            <h2>9. Third-Party Services</h2>
            <p>Our services integrate with third-party platforms including:</p>
            <ul>
              <li><strong>Google Cloud Platform:</strong> Infrastructure and authentication services</li>
              <li><strong>Supabase:</strong> Database and authentication services</li>
              <li><strong>Analytics Providers:</strong> To understand usage patterns</li>
            </ul>
            <p>
              These third parties have their own privacy policies. We encourage you to review them.
            </p>

            <h2>10. Children's Privacy</h2>
            <p>
              Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.
            </p>

            <h2>11. International Data Transfers</h2>
            <p>
              Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your information in compliance with applicable data protection laws.
            </p>

            <h2>12. Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy on this page and updating the "Last Updated" date. Continued use of our services constitutes acceptance of the updated policy.
            </p>

            <h2>13. Contact Information</h2>
            <p>
              If you have questions or concerns about this Privacy Policy, please contact us:
            </p>
            <ul>
              <li><strong>Email:</strong> <a href="mailto:xmrtsolutions@gmail.com">xmrtsolutions@gmail.com</a></li>
              <li><strong>Organization:</strong> Suite by XMRT-DAO</li>
              <li><strong>Website:</strong> <a href="https://suite-beta.vercel.app">https://suite-beta.vercel.app</a></li>
            </ul>

            <h2>14. Google Cloud Compliance</h2>
            <p>
              For Google Cloud Platform verification purposes, we confirm:
            </p>
            <ul>
              <li>We clearly disclose how user data is collected and used</li>
              <li>We obtain explicit consent before collecting sensitive information</li>
              <li>We provide users with control over their data</li>
              <li>We implement appropriate security measures</li>
              <li>We comply with applicable data protection regulations</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

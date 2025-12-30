import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsOfService() {
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
            <CardTitle className="text-3xl font-bold">Terms of Service</CardTitle>
            <p className="text-sm text-muted-foreground">
              Last Updated: December 30, 2024
            </p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <h2>1. Agreement to Terms</h2>
            <p>
              By accessing or using Suite ("Service," "Platform," or "we"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these terms, you may not access the Service.
            </p>

            <h2>2. Description of Service</h2>
            <p>
              Suite provides AI-powered executive services, including but not limited to:
            </p>
            <ul>
              <li>AI Chief Strategy Officer (CSO) - Business strategy and market analysis</li>
              <li>AI Chief Technology Officer (CTO) - Technical architecture and code review</li>
              <li>AI Chief Information Officer (CIO) - Data insights and analytics</li>
              <li>AI Chief Administrative Officer (CAO) - Compliance and documentation</li>
              <li>AI Chief Operations Officer (COO) - Operations and workflow management</li>
            </ul>

            <h2>3. User Accounts</h2>
            <h3>3.1 Account Creation</h3>
            <p>
              To access certain features, you must create an account. You agree to:
            </p>
            <ul>
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update account information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use</li>
            </ul>

            <h3>3.2 Account Eligibility</h3>
            <p>
              You must be at least 18 years old and have the legal capacity to enter into these Terms. By creating an account, you represent and warrant that you meet these requirements.
            </p>

            <h2>4. Acceptable Use</h2>
            <h3>4.1 Permitted Use</h3>
            <p>You may use the Service for lawful business purposes only.</p>

            <h3>4.2 Prohibited Activities</h3>
            <p>You agree NOT to:</p>
            <ul>
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon intellectual property rights</li>
              <li>Transmit malicious code, viruses, or harmful materials</li>
              <li>Attempt to gain unauthorized access to systems</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Use the Service for illegal, harmful, or fraudulent purposes</li>
              <li>Impersonate others or provide false information</li>
              <li>Scrape, harvest, or collect user data without permission</li>
              <li>Reverse engineer or attempt to extract source code</li>
              <li>Use the Service to compete with us</li>
            </ul>

            <h2>5. Intellectual Property Rights</h2>
            <h3>5.1 Our Intellectual Property</h3>
            <p>
              The Service, including all content, features, functionality, software, AI models, and designs, is owned by Suite (XMRT-DAO) and protected by copyright, trademark, and other intellectual property laws.
            </p>

            <h3>5.2 Your Content</h3>
            <p>
              You retain ownership of content you submit to the Service. By submitting content, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, and display your content solely to provide and improve the Service.
            </p>

            <h2>6. Subscription and Payment Terms</h2>
            <h3>6.1 Free Trial</h3>
            <p>
              We may offer a free trial period. At the end of the trial, your subscription will automatically convert to a paid plan unless cancelled.
            </p>

            <h3>6.2 Paid Subscriptions</h3>
            <ul>
              <li>Subscription fees are billed in advance on a recurring basis</li>
              <li>Fees are non-refundable except as required by law</li>
              <li>We reserve the right to change pricing with 30 days' notice</li>
              <li>You authorize us to charge your payment method automatically</li>
            </ul>

            <h3>6.3 Cancellation</h3>
            <p>
              You may cancel your subscription at any time. Cancellation takes effect at the end of your current billing period. You remain responsible for fees incurred before cancellation.
            </p>

            <h2>7. AI Services and Limitations</h2>
            <h3>7.1 AI-Generated Content</h3>
            <p>
              Our AI executives provide automated responses and recommendations. While we strive for accuracy:
            </p>
            <ul>
              <li>AI outputs may contain errors or inaccuracies</li>
              <li>AI advice should not replace professional human judgment</li>
              <li>You are responsible for reviewing and validating AI-generated content</li>
              <li>We do not guarantee specific outcomes or results</li>
            </ul>

            <h3>7.2 No Professional Advice</h3>
            <p>
              The Service does not provide legal, financial, medical, or other professional advice. Always consult qualified professionals for important decisions.
            </p>

            <h2>8. Privacy and Data Protection</h2>
            <p>
              Your use of the Service is subject to our Privacy Policy, which is incorporated into these Terms by reference. Please review our Privacy Policy to understand our data practices.
            </p>

            <h2>9. Third-Party Services</h2>
            <p>
              The Service may integrate with third-party platforms (Google Cloud, Supabase, etc.). Your use of third-party services is subject to their respective terms and policies. We are not responsible for third-party services.
            </p>

            <h2>10. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul>
              <li>MERCHANTABILITY</li>
              <li>FITNESS FOR A PARTICULAR PURPOSE</li>
              <li>NON-INFRINGEMENT</li>
              <li>ACCURACY OR RELIABILITY</li>
              <li>UNINTERRUPTED OR ERROR-FREE OPERATION</li>
            </ul>

            <h2>11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SUITE (XMRT-DAO) SHALL NOT BE LIABLE FOR:
            </p>
            <ul>
              <li>INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES</li>
              <li>LOSS OF PROFITS, DATA, USE, OR GOODWILL</li>
              <li>BUSINESS INTERRUPTION OR SYSTEM FAILURES</li>
              <li>DAMAGES RESULTING FROM THIRD-PARTY SERVICES</li>
            </ul>
            <p>
              OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM.
            </p>

            <h2>12. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Suite (XMRT-DAO), its affiliates, officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from:
            </p>
            <ul>
              <li>Your use or misuse of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any rights of another party</li>
              <li>Your content or data</li>
            </ul>

            <h2>13. Termination</h2>
            <h3>13.1 Termination by You</h3>
            <p>You may terminate your account at any time by contacting us.</p>

            <h3>13.2 Termination by Us</h3>
            <p>
              We may suspend or terminate your account immediately if you:
            </p>
            <ul>
              <li>Violate these Terms</li>
              <li>Fail to pay applicable fees</li>
              <li>Engage in fraudulent or illegal activities</li>
              <li>Pose a security risk to the Service</li>
            </ul>

            <h3>13.3 Effect of Termination</h3>
            <p>
              Upon termination, your right to use the Service ceases immediately. We may delete your data in accordance with our data retention policies.
            </p>

            <h2>14. Dispute Resolution</h2>
            <h3>14.1 Governing Law</h3>
            <p>
              These Terms are governed by the laws of the jurisdiction in which Suite (XMRT-DAO) operates, without regard to conflict of law principles.
            </p>

            <h3>14.2 Arbitration</h3>
            <p>
              Any disputes arising from these Terms shall be resolved through binding arbitration, except where prohibited by law.
            </p>

            <h2>15. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Material changes will be notified via email or prominent notice on the Service. Continued use after changes constitutes acceptance of the modified Terms.
            </p>

            <h2>16. General Provisions</h2>
            <h3>16.1 Entire Agreement</h3>
            <p>
              These Terms constitute the entire agreement between you and Suite regarding the Service.
            </p>

            <h3>16.2 Severability</h3>
            <p>
              If any provision is found unenforceable, the remaining provisions remain in full effect.
            </p>

            <h3>16.3 Waiver</h3>
            <p>
              Our failure to enforce any right or provision does not constitute a waiver of that right or provision.
            </p>

            <h3>16.4 Assignment</h3>
            <p>
              You may not assign these Terms without our prior written consent. We may assign these Terms at any time.
            </p>

            <h2>17. Contact Information</h2>
            <p>
              For questions about these Terms, please contact us:
            </p>
            <ul>
              <li><strong>Email:</strong> <a href="mailto:xmrtsolutions@gmail.com">xmrtsolutions@gmail.com</a></li>
              <li><strong>Organization:</strong> Suite by XMRT-DAO</li>
              <li><strong>Website:</strong> <a href="https://suite-beta.vercel.app">https://suite-beta.vercel.app</a></li>
            </ul>

            <h2>18. Google Cloud Compliance</h2>
            <p>
              For Google Cloud Platform verification purposes, these Terms:
            </p>
            <ul>
              <li>Clearly define user rights and responsibilities</li>
              <li>Establish acceptable use policies</li>
              <li>Address data protection and privacy</li>
              <li>Comply with applicable laws and regulations</li>
              <li>Provide transparent dispute resolution mechanisms</li>
            </ul>

            <p className="mt-8 text-sm text-muted-foreground">
              By using Suite, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

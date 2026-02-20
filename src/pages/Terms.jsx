import Navbar from "@/components/navigation/Navbar";
import Footer from "@/components/navigation/Footer";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { AlertCircle } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Header Banner */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 py-16 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-5xl font-bold mb-4">Terms of Service</h1>
          <p className="text-slate-300">Last Updated: February 20, 2026</p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-sm max-w-none">
            {/* 1. ACCEPTANCE OF TERMS */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">1. Acceptance of Terms</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                By creating an account or using NextSchool, you agree to be bound by these Terms of Service. These terms govern your access to and use of our platform, services, and content.
              </p>
              <p className="text-slate-700 leading-relaxed">
                If you do not agree with any part of these terms, please do not use NextSchool. Your continued use of the platform constitutes your acceptance of these terms.
              </p>
            </div>

            {/* 2. SERVICE DESCRIPTION */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">2. Service Description</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                NextSchool provides:
              </p>
              <ul className="list-disc list-inside text-slate-700 space-y-3 mb-6">
                <li>AI-powered school search recommendations</li>
                <li>School profile management and directory access</li>
                <li>Tools for comparing schools and managing shortlists</li>
              </ul>
              <div className="space-y-4 text-sm text-slate-700">
                <div className="border-l-4 border-amber-600 pl-4">
                  <p className="font-semibold text-slate-900 mb-2">AI Consultant Guidance:</p>
                  <p>Our AI consultant provides informational guidance only. Recommendations are <em>not</em> guarantees of school fit, admission outcomes, or educational success.</p>
                </div>
                <div className="border-l-4 border-amber-600 pl-4">
                  <p className="font-semibold text-slate-900 mb-2">School Data:</p>
                  <p>School data is provided by schools themselves and public sources. NextSchool does not independently verify every detail and is not liable for inaccuracies in school-provided information.</p>
                </div>
              </div>
            </div>

            {/* 3. USER ACCOUNTS */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">3. User Accounts</h2>
              <ul className="list-disc list-inside text-slate-700 space-y-3">
                <li><strong>Age Requirement:</strong> You must be 18 years of age or older to create a parent account and use NextSchool</li>
                <li><strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your password and account credentials</li>
                <li><strong>One Account Per Person:</strong> Accounts are personal and non-transferable. You may not share your account with others or create multiple accounts</li>
                <li><strong>Accurate Information:</strong> You agree to provide accurate, current, and truthful information when creating and updating your account</li>
              </ul>
            </div>

            {/* 4. ACCEPTABLE USE */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">4. Acceptable Use</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                You agree not to use NextSchool for any unlawful or prohibited activity, including:
              </p>
              <ul className="list-disc list-inside text-slate-700 space-y-3">
                <li>Misrepresenting your identity, especially in the school claim or verification process</li>
                <li>Scraping, crawling, or automated data collection from our platform</li>
                <li>Using the platform to harass, threaten, or abuse schools or other users</li>
                <li>Attempting to reverse-engineer, decompile, or bypass the AI system</li>
                <li>Uploading malicious software, viruses, or harmful content</li>
              </ul>
            </div>

            {/* 5. SCHOOL CLAIMS */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">5. School Claims</h2>
              <ul className="list-disc list-inside text-slate-700 space-y-3">
                <li><strong>Verification Required:</strong> Schools must verify their affiliation through our claim process before managing a school profile</li>
                <li><strong>Fraudulent Claims:</strong> NextSchool reserves the right to revoke claims if verification is found to be fraudulent or false</li>
                <li><strong>Community Standards:</strong> Claimed school profiles remain subject to NextSchool's community standards and policies</li>
                <li><strong>Accuracy Responsibility:</strong> Schools are solely responsible for the accuracy and completeness of information they provide in their profile</li>
              </ul>
            </div>

            {/* 6. INTELLECTUAL PROPERTY */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">6. Intellectual Property</h2>
              <ul className="list-disc list-inside text-slate-700 space-y-3 mb-6">
                <li><strong>NextSchool IP:</strong> NextSchool owns all rights to the platform, design, features, and AI consultant logic. You may not copy, modify, or distribute these without permission</li>
                <li><strong>School Content:</strong> Schools retain ownership of their content but grant NextSchool a perpetual license to display and promote it on the platform</li>
                <li><strong>Your Content:</strong> Parents retain ownership of their notes, personal data, and content. You grant NextSchool the right to use this data to improve recommendations</li>
              </ul>
            </div>

            {/* 7. AI DISCLAIMER */}
            <div className="mb-12">
              <div className="flex gap-4 bg-red-50 border-2 border-red-200 rounded-lg p-6 mb-6">
                <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-bold text-red-900 mb-3">Important AI Disclaimer</h3>
                  <ul className="list-disc list-inside text-red-900 space-y-3 text-sm">
                    <li><strong>Informational Only:</strong> The AI consultant provides recommendations based on available data and your stated preferences. These are not professional educational consulting advice</li>
                    <li><strong>No Guarantees:</strong> NextSchool is <em>not responsible</em> for enrollment outcomes, school performance, or family satisfaction with schools we recommend</li>
                    <li><strong>Verify Information:</strong> You should verify all information directly with schools before making enrollment decisions</li>
                    <li><strong>Potential Errors:</strong> AI responses may occasionally contain errors or outdated information. Use recommendations as a starting point only</li>
                  </ul>
                </div>
              </div>

              <h2 className="text-3xl font-bold text-slate-900 mb-6">7. AI Disclaimer Details</h2>
              <p className="text-slate-700 leading-relaxed">
                NextSchool's AI consultant tool is designed to help you explore schools that match your preferences. However, school fit is highly personal and depends on many factors that may not be captured in our system. We recommend speaking directly with school representatives, visiting campuses, and consulting with educational advisors to make informed enrollment decisions.
              </p>
            </div>

            {/* 8. PAYMENT TERMS */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">8. Payment Terms</h2>
              <ul className="list-disc list-inside text-slate-700 space-y-3">
                <li><strong>Free Tier:</strong> Our free tier provides limited features as described on our Pricing page</li>
                <li><strong>Premium Features:</strong> Any premium features, subscription plans, and pricing will be clearly communicated to you before any charges are applied</li>
                <li><strong>Future Billing:</strong> When subscription billing becomes available, cancellation and refund policies will be detailed here and updated on our Pricing page</li>
                <li><strong>Currency:</strong> All prices are in Canadian dollars (CAD) unless otherwise stated</li>
              </ul>
            </div>

            {/* 9. LIMITATION OF LIABILITY */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">9. Limitation of Liability</h2>
              <ul className="list-disc list-inside text-slate-700 space-y-3">
                <li><strong>No Liability for Decisions:</strong> NextSchool is not liable for decisions made based on recommendations from our AI consultant or school information</li>
                <li><strong>As-Is Service:</strong> The service is provided "as is" without warranties of accuracy, completeness, or fitness for a particular purpose</li>
                <li><strong>Cap on Damages:</strong> To the maximum extent permitted by law, NextSchool's total liability is limited to the fees you paid in the 12 months prior to the claim</li>
                <li><strong>No Consequential Damages:</strong> NextSchool is not liable for indirect, incidental, consequential, or punitive damages</li>
              </ul>
            </div>

            {/* 10. TERMINATION */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">10. Termination</h2>
              <ul className="list-disc list-inside text-slate-700 space-y-3">
                <li><strong>Mutual Termination:</strong> Either you or NextSchool may terminate your account and use of the service at any time</li>
                <li><strong>Suspension for Violations:</strong> NextSchool may suspend or terminate your account if you violate these terms</li>
                <li><strong>Data Handling:</strong> Upon termination, your data is handled in accordance with our Privacy Policy</li>
                <li><strong>Surviving Provisions:</strong> Sections on Intellectual Property, Limitation of Liability, and Governing Law survive termination of these terms</li>
              </ul>
            </div>

            {/* 11. GOVERNING LAW */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">11. Governing Law</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                These Terms of Service are governed by and construed in accordance with the laws of the Province of Ontario, Canada, without regard to its conflicts of law principles.
              </p>
              <p className="text-slate-700 leading-relaxed">
                Any legal action or proceeding arising out of or related to these terms or the use of NextSchool shall be exclusively resolved in the courts of Ontario, and you agree to submit to the jurisdiction of those courts.
              </p>
            </div>

            {/* 12. CONTACT */}
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">12. Contact Us</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                If you have questions about these Terms of Service, please reach out:
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                <p className="text-slate-900 font-semibold mb-2">Email:</p>
                <p className="text-teal-600 mb-6">
                  <a href="mailto:legal@nextschool.ca" className="hover:underline">legal@nextschool.ca</a>
                </p>
                <p className="text-slate-900 font-semibold mb-2">Questions or Feedback?</p>
                <Link to={createPageUrl('Contact')} className="text-teal-600 hover:underline">
                  Visit our Contact Page
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
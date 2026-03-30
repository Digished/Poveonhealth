export const AGREEMENT_VERSION = "v1.0-2026";

/** Flatten the default agreement to a plain-text string for editing. */
export function serializeAgreementToText(labName: string): string {
  return buildAgreementSections(labName)
    .map((s) => `${s.title}\n\n${s.clauses.join("\n\n")}`)
    .join("\n\n---\n\n");
}

export interface AgreementSection {
  title: string;
  clauses: string[];
}

export function buildAgreementSections(labName: string): AgreementSection[] {
  return [
    {
      title: "1. Definitions",
      clauses: [
        `In this Agreement, the following terms shall have the meanings set out below:\n\n"Effective Date" means the date this Agreement is signed by both Parties.\n\n"Platform" means the Poveon digital platform, including the laboratory dashboard and all related services.\n\n"Referral" or "Qualified Lead" means a patient test request routed to the Laboratory through the Platform together with a unique referral code.\n\n"Price List" means the complete and accurate list of tests, descriptions, and prices submitted by the Laboratory and recorded on the Platform, representing the prices at which tests are offered to patients referred through the Platform.\n\n"Platform Lead Fee" means the fee payable by the Laboratory to Poveon under Clause 5.1, at the then-current rate as notified by Poveon from time to time.\n\n"Wallet" means the Laboratory's dedicated digital wallet maintained on the Platform.`,
      ],
    },
    {
      title: "2. Parties",
      clauses: [
        `This Laboratory Partnership Agreement ("Agreement") is entered into between Poveon Ltd, a company duly incorporated under the laws of the Federal Republic of Nigeria with registration number RC 8921141 ("Poveon"), and ${labName} ("Laboratory"), collectively referred to as the "Parties".`,
        `This Agreement governs the terms under which the Laboratory shall be listed and operate on the Poveon Platform.`,
      ],
    },
    {
      title: "3. Background",
      clauses: [
        `Poveon operates a digital health platform that connects patients and physicians with accredited diagnostic laboratories across Nigeria for seamless referral, booking, and management of laboratory test requests.`,
        `The Laboratory is a duly licensed and accredited diagnostic facility that wishes to receive patient referrals and test requests through the Platform.`,
      ],
    },
    {
      title: "4. Scope of Services",
      clauses: [
        `Poveon shall list the Laboratory on the Platform and make the Laboratory's test catalog, Price List, and availability accessible to patients, physicians, and healthcare providers.`,
        `The Laboratory shall receive and process patient test requests routed through the Platform in accordance with this Agreement.`,
        `Poveon shall provide the Laboratory with access to a dedicated laboratory dashboard for managing referrals, results, pricing, and team members.`,
      ],
    },
    {
      title: "5. Platform Fee, Commission, Wallet, and Payment",
      clauses: [
        `5.1 Platform Lead Fee\nIn consideration of the referral and lead-generation services provided by Poveon, the Laboratory agrees to pay Poveon a Platform Lead Fee on the assessed value of each Referral delivered through the Platform. The Platform Lead Fee rate is set by Poveon and notified to the Laboratory in writing (including by update on the dashboard); the current rate at the time of signing is set out in the Schedule to this Agreement. Poveon may revise the Platform Lead Fee rate by giving the Laboratory not less than fourteen (14) days' prior written notice. Continued use of the Platform after the notice period constitutes acceptance of the revised rate. The assessed value of each Referral is calculated using the total value of the tests in that Referral based on the Laboratory's current Price List recorded on the Platform at the time the Referral is received.`,

        `5.2 Basis of Assessment\nThe Platform Lead Fee is charged at the moment a Referral code is submitted and the test request is received by the Laboratory, regardless of whether the patient ultimately completes the tests. The fee is for the delivery of a qualified lead only.\n\nExample: If a Referral for tests valued at ₦50,000 (per the Laboratory's submitted Price List) is received, and the then-current Platform Lead Fee rate is 1.5%, the Platform Lead Fee for that Referral is ₦750.`,

        `5.3 Referral Dispute Window\nThe Laboratory may dispute a specific Referral as invalid (for example, where there is evidence the referral code was submitted fraudulently or in error) by notifying Poveon in writing within forty-eight (48) hours of receipt, providing sufficient supporting information. Poveon shall investigate and, where the Referral is confirmed invalid, credit the corresponding Platform Lead Fee to the Wallet. Referrals not disputed within the forty-eight (48) hour window shall be deemed valid and the associated Platform Lead Fee shall be non-refundable.`,

        `5.4 Physician Referral Commission\nPoveon shall separately pay a physician referral commission to the referring physician upon confirmed test completion, at the rate applicable under Poveon's physician partnership terms at the time of referral. This commission is paid by Poveon from its own revenue and creates no additional financial obligation on the Laboratory beyond the Platform Lead Fee in Clause 5.1.`,

        `5.5 Price List Submission and Maintenance\nThe Laboratory shall submit a complete and accurate Price List for all tests offered through the Platform, representing the prices at which those tests are offered to patients referred through the Platform. The Laboratory shall update the Price List promptly whenever its pricing changes. The Platform Lead Fee for each Referral will be calculated using the Price List recorded on the Platform at the time of that Referral. Poveon is not liable for fee calculations based on an outdated Price List where the Laboratory has failed to submit timely updates.`,

        `5.6 Laboratory Wallet\nPoveon shall maintain a Wallet for the Laboratory. Platform Lead Fees shall be automatically debited from the Wallet upon receipt of each Referral. The Laboratory must maintain a sufficient Wallet balance at all times to cover accruing Platform Lead Fees.`,

        `5.7 Wallet Funding\nThe Laboratory may fund the Wallet by transferring funds to the dedicated virtual bank account assigned to the Laboratory on the Platform. Credits are applied to the Wallet upon confirmed receipt and settlement of funds. All Wallet activity, including credits, debits, and current balance, is visible to authorised Laboratory administrators through the dashboard.`,

        `5.8 Insufficient Wallet Balance\nIf the Wallet balance is insufficient to cover the Platform Lead Fee for a new Referral, Poveon may: (a) temporarily suspend the routing of new Referrals to the Laboratory until the Wallet is adequately funded; and/or (b) record the shortfall as a debt owed by the Laboratory to Poveon. Poveon shall notify the Laboratory promptly of any such suspension.`,

        `5.9 Outstanding Balances\nIf the Wallet remains in deficit for more than seven (7) calendar days, Poveon may suspend the Laboratory's listing on the Platform until the outstanding balance is cleared. Persistent or repeated deficits may constitute grounds for termination under Clause 15.`,

        `5.10 Monthly Reconciliation\nPoveon shall provide monthly Wallet and transaction reconciliation statements accessible via the laboratory dashboard, detailing all Referrals received, Platform Lead Fees debited, credits applied, and closing Wallet balance for each month.`,

        `5.11 Payment for Laboratory Services\nThe Laboratory is solely responsible for invoicing, collecting, and receiving payment directly from patients (or referring physicians, as applicable) for all tests performed. Poveon has no obligation to collect, hold, process, or remit any test fees or other patient payments on behalf of the Laboratory. The Platform Lead Fee remains payable regardless of whether the Laboratory successfully collects payment from the patient. Poveon may, in the future, introduce an optional integrated patient payment facilitation service on the Platform. If introduced, the Parties will amend this Agreement in writing to reflect the updated payment flow. Until such amendment is executed, all patient payments continue to flow directly to the Laboratory.`,

        `5.12 Taxes\nAll Platform Lead Fees are stated exclusive of Value Added Tax (VAT) and any other applicable taxes. The Laboratory is responsible for remitting any VAT or taxes due on payments made under this Agreement in accordance with applicable Nigerian tax law.`,
      ],
    },
    {
      title: "6. Laboratory Obligations",
      clauses: [
        `The Laboratory shall:\n\n(a) maintain all required licences, certifications, and accreditations and comply with all applicable Nigerian laws and regulations for operating a diagnostic laboratory throughout the term of this Agreement, and promptly notify Poveon of any changes to its accreditation status;\n\n(b) ensure that all tests listed on the Platform are within its accredited scope of practice;\n\n(c) process patient samples and deliver results within the turnaround times represented on the Platform, and promptly communicate any material deviation to Poveon;\n\n(d) maintain accurate and up-to-date test listings, prices, and availability on the Platform at all times;\n\n(e) treat all patient information received through the Platform with the utmost confidentiality in compliance with the Nigeria Data Protection Act 2023 (NDPA) and all applicable data protection laws; and\n\n(f) not contact patients or physicians obtained through the Platform for any purpose other than processing the specific Poveon-referred test request, without Poveon's prior written consent.`,
      ],
    },
    {
      title: "7. Poveon Obligations",
      clauses: [
        `Poveon shall:\n\n(a) use reasonable endeavours to maintain the availability and performance of the Platform and laboratory dashboard;\n\n(b) market and promote the Laboratory's services to users of the Platform;\n\n(c) provide reasonable technical support to the Laboratory for use of the dashboard and Platform features;\n\n(d) process Wallet credits promptly upon confirmed receipt and settlement of funds; and\n\n(e) pay physician referral commissions directly and independently, without seeking reimbursement from the Laboratory.`,
      ],
    },
    {
      title: "8. Patient Data and Privacy",
      clauses: [
        `Each Party shall comply with the Nigeria Data Protection Act 2023 (NDPA) and all applicable data protection regulations with respect to personal data processed in connection with this Agreement.`,
        `Patient personal data shared by Poveon with the Laboratory shall be used by the Laboratory solely for the purpose of processing the specific test request for which it was shared, and for no other purpose.`,
        `The Laboratory shall implement appropriate technical and organisational security measures to protect patient data against unauthorised access, disclosure, alteration, or destruction.`,
        `Each Party shall promptly notify the other of any suspected or confirmed data breach that may affect patient data processed under this Agreement.`,
      ],
    },
    {
      title: "9. Confidentiality",
      clauses: [
        `Each Party agrees to keep confidential all proprietary or non-public information of the other Party disclosed in connection with this Agreement, including but not limited to fee structures, patient data, business processes, and technical systems.`,
        `Confidentiality obligations shall survive the termination of this Agreement for a period of three (3) years.`,
        `Confidentiality obligations shall not apply to information that: (a) is or becomes publicly available through no fault of the receiving Party; (b) was already known to the receiving Party prior to disclosure; or (c) is required to be disclosed by applicable law or court order, provided the disclosing Party is given reasonable prior written notice.`,
      ],
    },
    {
      title: "10. Intellectual Property",
      clauses: [
        `Each Party retains all intellectual property rights in its own pre-existing materials. Nothing in this Agreement shall constitute a transfer of intellectual property rights from one Party to the other.`,
        `The Laboratory grants Poveon a non-exclusive, royalty-free licence to use the Laboratory's name, logo, and test information solely for the purpose of listing and marketing the Laboratory's services on the Platform.`,
        `Poveon retains all rights, title, and interest in the Platform, dashboard, and all related technology, software, and materials.`,
      ],
    },
    {
      title: "11. Representations and Warranties",
      clauses: [
        `Each Party represents and warrants that: (a) it has full legal authority to enter into this Agreement; (b) this Agreement constitutes a valid and legally binding obligation of the Party; and (c) its performance under this Agreement will not violate any applicable law or conflict with any other agreement to which it is a party.`,
        `The Laboratory additionally warrants that all information provided to Poveon regarding its services, test capabilities, accreditations, and Price List is accurate and complete.`,
      ],
    },
    {
      title: "12. Indemnification",
      clauses: [
        `12.1 The Laboratory shall indemnify, defend, and hold harmless Poveon and its officers, directors, employees, and agents from and against any claims, losses, damages, liabilities, costs, and expenses (including reasonable legal fees) arising from: (a) any breach of this Agreement by the Laboratory; (b) the performance or failure to perform diagnostic tests; (c) inaccurate or erroneous test results; (d) any breach of data protection or confidentiality obligations; or (e) any violation of applicable laws by the Laboratory.`,
        `12.2 Poveon shall indemnify the Laboratory against any third-party claims that the Platform itself (excluding Laboratory content) infringes a third party's intellectual property rights.`,
        `12.3 Indemnification obligations under this clause shall survive the termination or expiry of this Agreement.`,
      ],
    },
    {
      title: "13. Limitation of Liability",
      clauses: [
        `To the maximum extent permitted by applicable law, neither Party shall be liable to the other for any indirect, incidental, special, consequential, or punitive damages arising out of or in connection with this Agreement, however caused.`,
        `Poveon's total aggregate liability to the Laboratory under or in connection with this Agreement shall not exceed the total Platform Lead Fees paid by the Laboratory to Poveon in the three (3) months immediately preceding the event giving rise to the claim.`,
        `The limitations of liability in this clause shall not apply to: (a) death or personal injury; (b) fraud or fraudulent misrepresentation; or (c) any liability that cannot be excluded by applicable law.`,
      ],
    },
    {
      title: "14. Term and Renewal",
      clauses: [
        `This Agreement shall commence on the Effective Date and shall remain in effect for an initial term of twelve (12) months ("Initial Term").`,
        `Upon expiry of the Initial Term, this Agreement shall automatically renew for successive twelve (12) month periods unless either Party provides the other with at least thirty (30) days' written notice of its intention not to renew, prior to the end of the then-current term.`,
      ],
    },
    {
      title: "15. Termination",
      clauses: [
        `15.1 Either Party may terminate this Agreement for convenience upon thirty (30) days' written notice to the other Party.`,
        `15.2 Either Party may terminate this Agreement immediately upon written notice if the other Party: (a) commits a material breach of this Agreement and fails to remedy such breach within fourteen (14) days of receiving written notice; (b) becomes insolvent, is placed into liquidation, or ceases to carry on business; or (c) commits any act of fraud or wilful misconduct.`,
        `15.3 Upon termination: (a) any Wallet deficit or amounts owed by the Laboratory to Poveon shall become immediately due and payable; (b) the Laboratory's access to the Platform dashboard shall be deactivated; and (c) each Party shall promptly return or destroy the other Party's confidential information.`,
        `15.4 Termination shall not affect any rights or obligations that have accrued prior to the date of termination. Clauses 8 (Patient Data and Privacy), 9 (Confidentiality), 10 (Intellectual Property), 12 (Indemnification), 13 (Limitation of Liability), 17 (Governing Law and Dispute Resolution), and any other clause that by its nature should survive, shall survive termination or expiry of this Agreement.`,
      ],
    },
    {
      title: "16. Force Majeure",
      clauses: [
        `Neither Party shall be liable for any delay or failure to perform its obligations under this Agreement (except for payment obligations) to the extent such delay or failure is caused by events beyond its reasonable control, including but not limited to acts of God, war, terrorism, epidemic, pandemic, government action, or failure of power or internet infrastructure. The affected Party shall notify the other promptly and use reasonable efforts to mitigate the impact of such events.`,
      ],
    },
    {
      title: "17. Governing Law and Dispute Resolution",
      clauses: [
        `This Agreement shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria.`,
        `The Parties shall first attempt to resolve any dispute arising out of or in connection with this Agreement through good-faith negotiation. If the dispute is not resolved within thirty (30) days of written notice, either Party may refer the matter to mediation administered by the Lagos Multi-Door Courthouse or any other mutually agreed mediator.`,
        `If mediation fails to resolve the dispute within sixty (60) days, either Party may commence proceedings in the courts of Lagos State, Federal Republic of Nigeria, to whose jurisdiction the Parties hereby irrevocably submit.`,
      ],
    },
    {
      title: "18. Miscellaneous",
      clauses: [
        `18.1 This Agreement constitutes the entire agreement between the Parties with respect to its subject matter and supersedes all prior agreements, representations, and understandings, whether written or oral.`,
        `18.2 No amendment or modification of this Agreement shall be valid unless made in writing and signed by authorised representatives of both Parties.`,
        `18.3 If any provision of this Agreement is found to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.`,
        `18.4 Neither Party may assign or transfer any of its rights or obligations under this Agreement without the prior written consent of the other Party, except that Poveon may assign this Agreement in connection with a merger, acquisition, or sale of all or substantially all of its assets.`,
        `18.5 A failure or delay by either Party to exercise any right or remedy under this Agreement shall not be construed as a waiver of that right or remedy.`,
        `18.6 Notices under this Agreement shall be in writing and delivered by email to the registered addresses of each Party. Notices to Poveon shall be sent to legal@poveonhealth.com. Notices to the Laboratory shall be sent to the email address provided during onboarding or as updated by the Laboratory in the dashboard.`,
      ],
    },
    {
      title: "Schedule — Current Platform Lead Fee Rate",
      clauses: [
        `As at the Effective Date of this Agreement, the Platform Lead Fee rate under Clause 5.1 is one point five percent (1.5%) of the assessed value of each Referral.\n\nThis rate may be revised by Poveon upon not less than fourteen (14) days' prior written notice to the Laboratory in accordance with Clause 5.1. The current applicable rate is always visible on the Laboratory's dashboard.`,
      ],
    },
  ];
}

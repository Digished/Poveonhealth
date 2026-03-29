export const AGREEMENT_VERSION = "v1.0-2025";

export const EFFECTIVE_DATE = "1st January 2025";

export interface AgreementSection {
  title: string;
  clauses: string[];
}

export function buildAgreementSections(labName: string): AgreementSection[] {
  return [
    {
      title: "1. Parties",
      clauses: [
        `This Laboratory Partnership Agreement ("Agreement") is entered into between Poveon Health Limited, a company duly incorporated under the laws of the Federal Republic of Nigeria ("Poveon"), and ${labName} ("Laboratory"), collectively referred to as the "Parties".`,
        `This Agreement governs the terms and conditions under which the Laboratory shall be listed and operate on the Poveon Health platform.`,
      ],
    },
    {
      title: "2. Background",
      clauses: [
        `Poveon operates a digital health platform that connects patients and physicians with accredited diagnostic laboratories across Nigeria, enabling the seamless referral, booking, and management of laboratory test requests.`,
        `The Laboratory is a duly licensed and accredited diagnostic facility that wishes to receive patient referrals and test requests through the Poveon platform.`,
      ],
    },
    {
      title: "3. Scope of Services",
      clauses: [
        `Poveon shall list the Laboratory on its platform and make the Laboratory's test catalog, pricing, and availability accessible to patients, physicians, and healthcare providers using the Poveon platform.`,
        `The Laboratory shall receive and process patient test requests routed through the Poveon platform in accordance with the terms of this Agreement.`,
        `Poveon shall provide the Laboratory with access to a dedicated laboratory dashboard for managing requests, results, pricing, and team members.`,
      ],
    },
    {
      title: "4. Commission and Fees",
      clauses: [
        `The Laboratory agrees to pay Poveon a platform service commission on each test request processed through the Poveon platform. The applicable commission rate for each test shall be as set out in the Laboratory's price catalog, accessible via the laboratory dashboard.`,
        `Commission rates are determined on a per-test basis and may be updated by mutual written agreement between the Parties with no fewer than fourteen (14) days' prior notice.`,
        `Poveon shall maintain a digital wallet on behalf of the Laboratory on the platform. Commission amounts shall be debited from the Laboratory's wallet balance as requests are marked as 'Seen' on the platform.`,
        `The Laboratory undertakes to maintain a sufficient wallet balance to cover accrued commissions. Poveon reserves the right to suspend the Laboratory's listing if the wallet balance remains in deficit for more than seven (7) calendar days.`,
        `Poveon shall provide monthly commission reconciliation statements accessible via the laboratory dashboard.`,
      ],
    },
    {
      title: "5. Laboratory Obligations",
      clauses: [
        `The Laboratory shall maintain all required licences, certifications, and accreditations required under applicable Nigerian law to operate as a diagnostic laboratory throughout the term of this Agreement, and shall promptly notify Poveon of any changes to its accreditation status.`,
        `The Laboratory shall ensure that all tests listed in its price catalog are within its accredited scope of practice.`,
        `The Laboratory shall process patient samples and deliver results within the turnaround times represented on the platform. Any material deviation from stated turnaround times shall be communicated to Poveon promptly.`,
        `The Laboratory shall maintain accurate and up-to-date test listings, prices, and availability on the platform.`,
        `The Laboratory shall treat all patient information received through the platform with the utmost confidentiality in compliance with applicable data protection laws.`,
        `The Laboratory shall not contact patients or physicians obtained through the Poveon platform for purposes other than the processing of Poveon-referred test requests, without the prior written consent of Poveon.`,
      ],
    },
    {
      title: "6. Poveon Obligations",
      clauses: [
        `Poveon shall use reasonable endeavours to maintain the availability and performance of the platform and laboratory dashboard.`,
        `Poveon shall market and promote the Laboratory's services to users of the platform.`,
        `Poveon shall provide reasonable technical support to the Laboratory for the use of the dashboard and platform features.`,
        `Poveon shall process wallet credits received from the Laboratory promptly upon confirmed receipt of funds.`,
      ],
    },
    {
      title: "7. Patient Data and Privacy",
      clauses: [
        `Each Party shall comply with the Nigeria Data Protection Act 2023 (NDPA) and all applicable data protection regulations with respect to personal data processed in connection with this Agreement.`,
        `Patient personal data shared by Poveon with the Laboratory shall be used solely for the purpose of processing the specific test request for which it was shared, and for no other purpose.`,
        `The Laboratory shall implement appropriate technical and organisational measures to protect patient data against unauthorised access, disclosure, alteration, or destruction.`,
        `Each Party shall promptly notify the other of any suspected or confirmed data breach that may affect patient data processed under this Agreement.`,
      ],
    },
    {
      title: "8. Confidentiality",
      clauses: [
        `Each Party agrees to keep confidential all proprietary or non-public information of the other Party disclosed in connection with this Agreement, including but not limited to pricing structures, patient data, business processes, and technical systems.`,
        `Confidentiality obligations shall survive the termination of this Agreement for a period of three (3) years.`,
        `Confidentiality obligations shall not apply to information that: (a) is or becomes publicly available through no fault of the receiving Party; (b) was already known to the receiving Party prior to disclosure; (c) is required to be disclosed by applicable law or court order, provided the disclosing Party is given reasonable prior notice.`,
      ],
    },
    {
      title: "9. Intellectual Property",
      clauses: [
        `Each Party retains all intellectual property rights in its own pre-existing materials. Nothing in this Agreement shall constitute a transfer of intellectual property rights from one Party to the other.`,
        `The Laboratory grants Poveon a non-exclusive, royalty-free licence to use the Laboratory's name, logo, and test information for the purpose of listing and marketing the Laboratory's services on the Poveon platform.`,
        `Poveon retains all rights, title, and interest in the Poveon platform, dashboard, and all related technology, software, and materials.`,
      ],
    },
    {
      title: "10. Representations and Warranties",
      clauses: [
        `Each Party represents and warrants that: (a) it has full legal authority to enter into this Agreement; (b) this Agreement constitutes a valid and legally binding obligation of the Party; and (c) its performance under this Agreement will not violate any applicable law or conflict with any other agreement to which it is a party.`,
        `The Laboratory additionally warrants that all information provided to Poveon regarding its services, test capabilities, accreditations, and pricing is accurate and complete.`,
      ],
    },
    {
      title: "11. Limitation of Liability",
      clauses: [
        `To the maximum extent permitted by applicable law, neither Party shall be liable to the other for any indirect, incidental, special, consequential, or punitive damages arising out of or in connection with this Agreement, however caused.`,
        `Poveon's total aggregate liability to the Laboratory under or in connection with this Agreement shall not exceed the total commissions paid or payable by the Laboratory to Poveon in the three (3) months immediately preceding the event giving rise to the claim.`,
        `The limitations of liability in this clause shall not apply to: (a) death or personal injury; (b) fraud or fraudulent misrepresentation; or (c) any liability that cannot be excluded by applicable law.`,
      ],
    },
    {
      title: "12. Term and Renewal",
      clauses: [
        `This Agreement shall commence on the date of signing and shall remain in effect for an initial term of twelve (12) months ("Initial Term").`,
        `Upon expiry of the Initial Term, this Agreement shall automatically renew for successive twelve (12) month periods unless either Party provides the other with at least thirty (30) days' written notice of its intention not to renew, prior to the end of the then-current term.`,
      ],
    },
    {
      title: "13. Termination",
      clauses: [
        `Either Party may terminate this Agreement for convenience upon thirty (30) days' written notice to the other Party.`,
        `Either Party may terminate this Agreement immediately upon written notice if the other Party: (a) commits a material breach of this Agreement and fails to remedy such breach within fourteen (14) days of receiving written notice of the breach; (b) becomes insolvent, is placed into liquidation, or ceases to carry on business; or (c) commits any act of fraud or wilful misconduct.`,
        `Upon termination: (a) any outstanding commission balances owed by the Laboratory to Poveon shall become immediately due and payable; (b) the Laboratory's access to the platform dashboard shall be deactivated; and (c) each Party shall promptly return or destroy the other Party's confidential information.`,
        `Termination of this Agreement shall not affect any rights or obligations that have accrued prior to the date of termination.`,
      ],
    },
    {
      title: "14. Governing Law and Dispute Resolution",
      clauses: [
        `This Agreement shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria.`,
        `The Parties shall first attempt to resolve any dispute arising out of or in connection with this Agreement through good-faith negotiation. If the dispute is not resolved within thirty (30) days of written notice, either Party may refer the dispute to mediation administered by the Lagos Multi-Door Courthouse or any other mutually agreed mediator.`,
        `If mediation fails to resolve the dispute within sixty (60) days, either Party may refer the matter to the courts of Lagos State, Federal Republic of Nigeria, to whose jurisdiction the Parties hereby irrevocably submit.`,
      ],
    },
    {
      title: "15. Miscellaneous",
      clauses: [
        `This Agreement constitutes the entire agreement between the Parties with respect to its subject matter and supersedes all prior agreements, representations, and understandings, whether written or oral.`,
        `No amendment or modification of this Agreement shall be valid unless made in writing and signed by authorised representatives of both Parties.`,
        `If any provision of this Agreement is found to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.`,
        `Neither Party may assign or transfer any of its rights or obligations under this Agreement without the prior written consent of the other Party, except that Poveon may assign this Agreement in connection with a merger, acquisition, or sale of all or substantially all of its assets.`,
        `A failure or delay by either Party to exercise any right or remedy under this Agreement shall not be construed as a waiver of that right or remedy.`,
        `Notices under this Agreement shall be in writing and delivered by email to the registered addresses of each Party. Notices to Poveon shall be sent to legal@poveonhealth.com.`,
      ],
    },
  ];
}

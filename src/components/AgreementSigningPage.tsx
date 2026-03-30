"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Check, ChevronDown, Shield, FileText, PenLine, AlertCircle,
  Loader2, Download, CheckCircle2, ArrowLeft,
} from "lucide-react";
import { buildAgreementSections, AGREEMENT_VERSION } from "@/lib/agreement/content";
import { PoveonLogo } from "@/components/PoveonLogo";

type Step = "loading" | "error" | "welcome" | "read" | "details" | "sign" | "done";

interface LabInfo {
  id: string;
  name: string;
  address: string;
  email: string;
  logo_url: string | null;
}

// ── Clause renderer ────────────────────────────────────────────────────────────
// Handles:
//  • "5.1 Platform Lead Fee\nBody text..." → bold highlighted title + body
//  • "15.1 Either Party may..." → bold numbered label + inline text
//  • Multi-paragraph clauses (split on \n\n)
//  • **bold** inline markdown
function InlineText({ text }: { text: string }) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-semibold text-slate-800">{p}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

function RenderClause({ text }: { text: string }) {
  const paras = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <div>
      {paras.map((para, i) => {
        // "5.1 Sub-Section Title\nBody content..." — explicit title + body
        const titleBody = para.match(/^(\d+\.\d+\s+[A-Z][^\n]{1,80})\n([\s\S]+)$/);
        if (titleBody) {
          return (
            <div key={i} className="mb-4">
              <p className="inline-block font-bold text-slate-900 text-sm bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg mb-2">
                {titleBody[1].trimEnd()}:
              </p>
              <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
                <InlineText text={titleBody[2].trim()} />
              </p>
            </div>
          );
        }
        // "15.1 Numbered label text..."
        const numbered = para.match(/^(\d+\.\d+)\s+([\s\S]+)$/);
        if (numbered) {
          return (
            <p key={i} className="mb-3 text-slate-600 text-sm leading-relaxed">
              <strong className="font-semibold text-slate-800">{numbered[1]}</strong>{" "}
              <InlineText text={numbered[2]} />
            </p>
          );
        }
        // Normal paragraph
        return (
          <p key={i} className="mb-3 text-slate-600 text-sm leading-relaxed whitespace-pre-line">
            <InlineText text={para} />
          </p>
        );
      })}
    </div>
  );
}

export default function AgreementSigningPage({ token }: { token: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [lab, setLab] = useState<LabInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [customContent, setCustomContent] = useState<string | null>(null);

  // Step: read
  const [hasScrolled, setHasScrolled] = useState(false);
  const [readConfirmed, setReadConfirmed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Step: details
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signerEmail, setSignerEmail] = useState("");

  // Step: sign
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Done
  const [refNo, setRefNo] = useState("");

  // Validate token on mount
  useEffect(() => {
    fetch(`/api/onboard/validate?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.valid) { setErrorMsg(d.error ?? "Invalid link"); setStep("error"); return; }
        setLab(d.lab);
        setSignerEmail(d.lab.email);
        setAlreadySigned(d.already_signed);
        if (d.custom_content) setCustomContent(d.custom_content);
        setStep("welcome");
      })
      .catch(() => { setErrorMsg("Could not load agreement. Please try again."); setStep("error"); });
  }, [token]);

  // Track scroll-to-bottom on the agreement text
  const handleAgreementScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setHasScrolled(true);
  }, []);

  // Canvas drawing — scale mouse/touch position to canvas coordinate space
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasDrawn(true);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function endDraw() { setIsDrawing(false); }

  function clearCanvas() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  async function handleSubmit() {
    if (!agreeChecked || !typedName.trim() || typedName.trim().toLowerCase() !== signerName.trim().toLowerCase()) {
      setSubmitError("Please type your full name exactly as entered in Step 3 to confirm.");
      return;
    }
    setSubmitError("");
    setSubmitting(true);

    let signatureDataUrl: string | undefined;
    if (hasDrawn && canvasRef.current) {
      signatureDataUrl = canvasRef.current.toDataURL("image/png");
    }

    try {
      const res = await fetch("/api/onboard/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signer_name: signerName.trim(),
          signer_title: signerTitle.trim() || undefined,
          signer_email: signerEmail.trim(),
          signature_data_url: signatureDataUrl,
          custom_content: customContent || undefined,
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      setRefNo(d.ref_no);
      setStep("done");
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Signing failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const sections = lab && !customContent ? buildAgreementSections(lab.name) : [];
  const customParagraphs = customContent
    ? customContent.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    : null;

  // ── Layout wrapper ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PoveonLogo className="w-7 h-7 text-slate-900" />
            <span className="font-bold text-slate-800 text-sm">Poveon</span>
          </div>
          {step !== "loading" && step !== "error" && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              Secure signing
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center py-10 px-4">
        <div className="w-full max-w-2xl">

          {/* ── Loading ── */}
          {step === "loading" && (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          )}

          {/* ── Error ── */}
          {step === "error" && (
            <div className="bg-white rounded-2xl border border-red-100 p-10 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-800 mb-2">Link Unavailable</h1>
              <p className="text-slate-500 text-sm">{errorMsg}</p>
              <p className="text-slate-400 text-xs mt-4">
                Please contact Poveon for a new invitation link.
              </p>
            </div>
          )}

          {/* ── Welcome ── */}
          {step === "welcome" && lab && (
            <div className="space-y-6">
              <StepIndicator current={1} />

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-8 py-8 flex items-start gap-4">
                  <PoveonLogo className="w-10 h-10 text-white shrink-0 mt-1" />
                  <div>
                    <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Poveon</p>
                    <h1 className="text-white text-2xl font-bold leading-tight mb-1">
                      Laboratory Partnership<br />Agreement
                    </h1>
                    <p className="text-slate-400 text-sm">Version {AGREEMENT_VERSION}</p>
                  </div>
                </div>

                <div className="px-8 py-8">
                  {alreadySigned && (
                    <div className="mb-6 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <p className="text-sm text-emerald-700 font-medium">
                        Your lab has already signed this agreement. You may sign again if needed.
                      </p>
                    </div>
                  )}

                  <div className="flex items-start gap-4 mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{lab.name}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{lab.address || "Address on file"}</p>
                    </div>
                  </div>

                  <p className="text-slate-600 text-sm leading-relaxed mb-6">
                    You have been invited to review and digitally sign the Poveon Laboratory
                    Partnership Agreement. This agreement governs the terms under which{" "}
                    <strong className="text-slate-800">{lab.name}</strong> will operate on the Poveon
                    platform.
                  </p>

                  <div className="grid grid-cols-3 gap-3 mb-8">
                    {[
                      { icon: FileText, label: "Read Agreement", desc: "18 clauses, ~5 min" },
                      { icon: PenLine, label: "Sign Digitally", desc: "Draw + type name" },
                      { icon: Shield, label: "Legally Binding", desc: "Nigerian law compliant" },
                    ].map(({ icon: Icon, label, desc }) => (
                      <div key={label} className="text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <Icon className="w-5 h-5 text-blue-600 mx-auto mb-1.5" />
                        <p className="text-xs font-semibold text-slate-700">{label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setStep("read")}
                    className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
                  >
                    Begin Signing →
                  </button>
                  <p className="text-center text-xs text-slate-400 mt-3">
                    By proceeding, you confirm you are authorised to sign on behalf of {lab.name}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Read Agreement (Step 2) ── */}
          {step === "read" && lab && (
            <div className="space-y-6">
              <StepIndicator current={2} />

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-slate-800">Read the Agreement</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Scroll to the bottom to proceed</p>
                  </div>
                  {hasScrolled && (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <Check className="w-3 h-3" /> Read
                    </span>
                  )}
                </div>

                {/* Scrollable agreement */}
                <div
                  ref={scrollRef}
                  onScroll={handleAgreementScroll}
                  className="h-[60vh] overflow-y-auto px-6 py-5 text-sm text-slate-700 leading-relaxed"
                >
                  <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs text-slate-500 italic">
                      This Laboratory Partnership Agreement (Version {AGREEMENT_VERSION}) is entered
                      into between Poveon Ltd and {lab.name}. By digitally signing this
                      document, both parties agree to be legally bound by the terms set forth below
                      under the laws of the Federal Republic of Nigeria.
                    </p>
                  </div>

                  {customParagraphs
                    ? customParagraphs.map((para, i) => (
                        <RenderClause key={i} text={para} />
                      ))
                    : sections.map((section) => (
                        <div key={section.title} className="mb-6">
                          <h3 className="font-bold text-slate-900 mb-3 text-sm border-l-4 border-blue-500 pl-3 py-0.5">
                            {section.title}
                          </h3>
                          {section.clauses.map((clause, i) => (
                            <RenderClause key={i} text={clause} />
                          ))}
                        </div>
                      ))}

                  <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700 leading-relaxed">
                    <strong>You have reached the end of the agreement.</strong> Please confirm below
                    that you have read and understood the full document before proceeding.
                  </div>
                </div>

                <div className="px-6 py-5 border-t border-slate-100 space-y-4">
                  {!hasScrolled && (
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-xs py-1">
                      <ChevronDown className="w-4 h-4 animate-bounce" />
                      Scroll down to read the full agreement
                    </div>
                  )}
                  <label className={`flex items-start gap-3 cursor-pointer select-none ${!hasScrolled ? "opacity-40 pointer-events-none" : ""}`}>
                    <div
                      onClick={() => hasScrolled && setReadConfirmed((v) => !v)}
                      className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${readConfirmed ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}
                    >
                      {readConfirmed && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm text-slate-700">
                      I confirm that I have read and understood the full Poveon Laboratory
                      Partnership Agreement and agree to be bound by its terms.
                    </span>
                  </label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep("welcome")}
                      className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={() => setStep("details")}
                      disabled={!readConfirmed}
                      className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm transition-colors"
                    >
                      Proceed to Sign →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Your Details (Step 3) ── */}
          {step === "details" && lab && (
            <div className="space-y-6">
              <StepIndicator current={3} />

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <h2 className="font-bold text-slate-800">Your Details</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Enter the details of the person signing on behalf of {lab.name}
                  </p>
                </div>
                <div className="px-6 py-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="e.g. Adaeze Okonkwo"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                      Title / Role <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={signerTitle}
                      onChange={(e) => setSignerTitle(e.target.value)}
                      placeholder="e.g. CEO, Lab Director, General Manager"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={signerEmail}
                      onChange={(e) => setSignerEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      A copy of the signed agreement will be sent to this address.
                    </p>
                  </div>

                  {/* Preview download */}
                  <a
                    href={`/api/onboard/preview-pdf?token=${token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4 text-slate-400" />
                    Download Agreement Preview (PDF)
                  </a>

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setStep("read")}
                      className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={() => setStep("sign")}
                      disabled={!signerName.trim() || !signerTitle.trim() || !signerEmail.trim()}
                      className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm transition-colors"
                    >
                      Continue to Signature →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Sign (Step 4) ── */}
          {step === "sign" && lab && (
            <div className="space-y-6">
              <StepIndicator current={4} />

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <h2 className="font-bold text-slate-800">Apply Your Signature</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Draw your signature in the box below</p>
                </div>

                <div className="px-6 py-6 space-y-5">
                  {/* Canvas */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        Draw Signature
                      </label>
                      <button
                        onClick={clearCanvas}
                        className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-2 transition"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="relative border-2 border-dashed border-slate-200 rounded-xl overflow-hidden bg-slate-50 hover:border-slate-300 transition-colors">
                      <canvas
                        ref={canvasRef}
                        width={560}
                        height={160}
                        className="w-full touch-none cursor-crosshair block"
                        style={{ touchAction: "none" }}
                        onMouseDown={startDraw}
                        onMouseMove={draw}
                        onMouseUp={endDraw}
                        onMouseLeave={endDraw}
                        onTouchStart={startDraw}
                        onTouchMove={draw}
                        onTouchEnd={endDraw}
                      />
                      {!hasDrawn && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <p className="text-slate-300 text-sm">Sign here</p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      Use your mouse or finger to draw your signature above.
                    </p>
                  </div>

                  {/* Type name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                      Type your full name to confirm <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      placeholder={signerName}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Type exactly: <strong className="text-slate-600">{signerName}</strong>
                    </p>
                  </div>

                  {/* Consent checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <div
                      onClick={() => setAgreeChecked((v) => !v)}
                      className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${agreeChecked ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}
                    >
                      {agreeChecked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm text-slate-700 leading-relaxed">
                      I, <strong>{signerName}</strong>, acting in my capacity as{" "}
                      <strong>{signerTitle}</strong> of <strong>{lab.name}</strong>, hereby agree
                      to be legally bound by the terms of the Poveon Laboratory Partnership
                      Agreement. I confirm this electronic signature is legally equivalent to my
                      handwritten signature.
                    </span>
                  </label>

                  {submitError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{submitError}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep("details")}
                      disabled={submitting}
                      className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !agreeChecked || !typedName.trim()}
                      className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Generating signed agreement…</>
                      ) : (
                        <><PenLine className="w-4 h-4" /> Sign &amp; Submit Agreement</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && lab && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-center">
                <div className="bg-emerald-600 px-8 py-10">
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-9 h-9 text-white" />
                  </div>
                  <h1 className="text-white text-2xl font-bold mb-1">Agreement Signed</h1>
                  <p className="text-emerald-100 text-sm">
                    {lab.name} is now onboarded to Poveon
                  </p>
                </div>

                <div className="px-8 py-8 space-y-4">
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 text-left space-y-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">Agreement Details</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Reference</span>
                      <span className="font-mono font-semibold text-slate-800">{refNo}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Laboratory</span>
                      <span className="font-semibold text-slate-800">{lab.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Signed by</span>
                      <span className="font-semibold text-slate-800">{signerName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Version</span>
                      <span className="font-semibold text-slate-800">{AGREEMENT_VERSION}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-left">
                    <Download className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-700">
                      A copy of the signed agreement has been sent to{" "}
                      <strong>{signerEmail}</strong>. Please check your inbox.
                    </p>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    This agreement is legally binding under the laws of the Federal Republic of
                    Nigeria. The signed document is stored securely on the Poveon platform.
                    If you have any questions, contact{" "}
                    <a href="mailto:legal@poveonhealth.com" className="text-blue-600 underline">
                      legal@poveonhealth.com
                    </a>.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-4 text-center">
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} Poveon Ltd · Secure digital signing ·{" "}
          <a href="https://poveonhealth.com/privacy" className="underline hover:text-slate-600">
            Privacy Policy
          </a>
        </p>
      </footer>
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  const steps = [
    { n: 1, label: "Welcome" },
    { n: 2, label: "Read" },
    { n: 3, label: "Details" },
    { n: 4, label: "Sign" },
  ];
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                s.n < current
                  ? "bg-emerald-500 text-white"
                  : s.n === current
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-400"
              }`}
            >
              {s.n < current ? <Check className="w-3.5 h-3.5" /> : s.n}
            </div>
            <span
              className={`text-[10px] mt-1 font-medium ${
                s.n === current ? "text-blue-600" : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-0.5 mb-4 mx-1 transition-colors ${s.n < current ? "bg-emerald-400" : "bg-slate-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

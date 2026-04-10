"use client";

import React, { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle, AlertTriangle, Loader } from "lucide-react";

interface TestInput {
  originalInput: string;
  canonical?: string;
  variant?: string | null;
  status: "resolved" | "ambiguous" | "unknown" | "validating" | "error";
  variants?: string[];
  reason?: string;
}

interface Props {
  labId: string;
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean, tests: TestInput[]) => void;
  disabled?: boolean;
}

export function TestTextareaWithValidation({
  labId,
  value,
  onChange,
  onValidationChange,
  disabled = false,
}: Props) {
  const [tests, setTests] = React.useState<TestInput[]>([]);
  const [isValidating, setIsValidating] = React.useState(false);
  const validateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Parse textarea and validate tests
  const validateTests = React.useCallback(
    async (textareaValue: string) => {
      setIsValidating(true);

      // Parse input: split by newline, filter empty
      const testLines = textareaValue
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (testLines.length === 0) {
        setTests([]);
        setIsValidating(false);
        onValidationChange?.(true, []);
        return;
      }

      // Start with "validating" status for all
      const initialTests: TestInput[] = testLines.map((line) => ({
        originalInput: line,
        status: "validating",
      }));
      setTests(initialTests);

      try {
        // Call resolve endpoint
        const response = await fetch("/api/tests/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            labId,
            testInputs: testLines,
          }),
        });

        if (!response.ok) {
          console.error("[TestTextarea] Resolve failed:", response.status);
          // Mark all as error
          setTests(
            testLines.map((line) => ({
              originalInput: line,
              status: "error" as const,
              reason: "validation_failed",
            }))
          );
          setIsValidating(false);
          onValidationChange?.(false, []);
          return;
        }

        const data = await response.json();
        if (!data.success) {
          console.error("[TestTextarea] Resolve error:", data.error);
          setTests(
            testLines.map((line) => ({
              originalInput: line,
              status: "error" as const,
              reason: "validation_failed",
            }))
          );
          setIsValidating(false);
          onValidationChange?.(false, []);
          return;
        }

        // Map results to TestInput
        const resolvedTests: TestInput[] = data.results.map(
          (result: any) => ({
            originalInput: result.input,
            canonical: result.canonical,
            variant: null, // User will select if ambiguous
            status: result.status,
            variants: result.variants,
            reason: result.reason,
          })
        );

        setTests(resolvedTests);

        // Check if all are resolved or ambiguous
        const allValid = resolvedTests.every(
          (t) => t.status === "resolved" || t.status === "ambiguous"
        );
        onValidationChange?.(allValid, resolvedTests);
      } catch (error) {
        console.error("[TestTextarea] Error validating:", error);
        setTests(
          testLines.map((line) => ({
            originalInput: line,
            status: "error" as const,
            reason: "network_error",
          }))
        );
        onValidationChange?.(false, []);
      }

      setIsValidating(false);
    },
    [labId, onValidationChange]
  );

  // Debounced validation
  useEffect(() => {
    if (validateTimeoutRef.current) {
      clearTimeout(validateTimeoutRef.current);
    }

    validateTimeoutRef.current = setTimeout(() => {
      validateTests(value);
    }, 500); // 500ms debounce

    return () => {
      if (validateTimeoutRef.current) {
        clearTimeout(validateTimeoutRef.current);
      }
    };
  }, [value, validateTests]);

  // Handle variant selection
  const selectVariant = (index: number, variant: string) => {
    const updated = [...tests];
    updated[index].variant = variant;
    updated[index].status = "resolved";
    setTests(updated);

    // Check if all resolved
    const allValid = updated.every((t) => t.status === "resolved");
    onValidationChange?.(allValid, updated);
  };

  // Get status indicator icon and color
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "resolved":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "ambiguous":
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case "unknown":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case "validating":
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "resolved":
        return "border-green-200 bg-green-50";
      case "ambiguous":
        return "border-yellow-200 bg-yellow-50";
      case "unknown":
        return "border-red-200 bg-red-50";
      case "validating":
        return "border-blue-200 bg-blue-50";
      case "error":
        return "border-red-200 bg-red-50";
      default:
        return "border-gray-200 bg-gray-50";
    }
  };

  const getStatusText = (test: TestInput) => {
    switch (test.status) {
      case "resolved":
        return `✓ ${test.canonical}${test.variant ? ` (${test.variant})` : ""}`;
      case "ambiguous":
        return `⚠ ${test.canonical} - Select equipment`;
      case "unknown":
        return test.reason === "not_in_lab"
          ? "✗ Not available at this lab"
          : "✗ Unknown test";
      case "validating":
        return "Validating...";
      case "error":
        return "✗ Validation error";
      default:
        return test.originalInput;
    }
  };

  return (
    <div className="space-y-4">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Enter tests (one per line)&#10;Example:&#10;FBC&#10;ESR&#10;Breast MRI"
        className="w-full h-32 p-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
      />

      {/* Validation results */}
      {tests.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Tests:</h4>
          {tests.map((test, index) => (
            <div key={index} className={`border rounded-lg p-3 ${getStatusColor(test.status)}`}>
              <div className="flex items-start gap-3">
                {getStatusIcon(test.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {test.originalInput}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {getStatusText(test)}
                  </p>

                  {/* Variant selection for ambiguous tests */}
                  {test.status === "ambiguous" && test.variants && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {test.variants.map((variant) => (
                        <button
                          key={variant}
                          onClick={() => selectVariant(index, variant)}
                          className="px-3 py-1 text-xs bg-yellow-200 hover:bg-yellow-300 text-yellow-900 rounded font-medium transition-colors"
                        >
                          {variant}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Validation status summary */}
      {tests.length > 0 && !isValidating && (
        <div className="text-xs text-gray-600">
          {(() => {
            const resolved = tests.filter((t) => t.status === "resolved").length;
            const ambiguous = tests.filter((t) => t.status === "ambiguous").length;
            const unknown = tests.filter((t) => t.status === "unknown").length;

            return (
              <p>
                {resolved > 0 && <span className="text-green-600">✓ {resolved} resolved</span>}
                {resolved > 0 && ambiguous > 0 && <span>, </span>}
                {ambiguous > 0 && (
                  <span className="text-yellow-600">⚠ {ambiguous} need selection</span>
                )}
                {(resolved > 0 || ambiguous > 0) && unknown > 0 && (
                  <span>, </span>
                )}
                {unknown > 0 && <span className="text-red-600">✗ {unknown} unknown</span>}
              </p>
            );
          })()}
        </div>
      )}

      {isValidating && (
        <p className="text-xs text-blue-600 flex items-center gap-2">
          <Loader className="w-3 h-3 animate-spin" />
          Validating tests...
        </p>
      )}
    </div>
  );
}

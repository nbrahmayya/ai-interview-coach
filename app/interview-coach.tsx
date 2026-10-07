"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type Difficulty = "Easy" | "Medium" | "Hard";
type Role = "interviewer" | "candidate";
type Screen = "setup" | "interview" | "report";

type Turn = {
  role: Role;
  content: string;
};

type InterviewContext = {
  topic: string;
  difficulty: Difficulty;
};

type InterviewReply = {
  message: string;
  ended: boolean;
  end_reason: "struggling" | "coverage_complete" | null;
};

type EvidenceItem = {
  evidence: string;
  assessment: string;
};

type InterviewReport = {
  score: number;
  performance_band: "Excellent" | "Good" | "Adequate" | "Weak";
  strengths: EvidenceItem[];
  weaknesses: EvidenceItem[];
  topics_to_revise: string[];
  overall_verdict: string;
  result: "Pass" | "Fail";
};

const difficulties: Difficulty[] = ["Easy", "Medium", "Hard"];
const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  if (!apiUrl) {
    throw new Error(
      "The backend URL is not configured. Set NEXT_PUBLIC_API_URL in .env.local and restart the frontend.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the backend. Check that it is running and try again.");
  }

  const body = (await response.json().catch(() => null)) as
    | { detail?: unknown; errors?: { field?: string; message?: string }[] }
    | null;
  if (!response.ok) {
    if (typeof body?.detail === "string") {
      throw new Error(body.detail);
    }
    if (Array.isArray(body?.errors) && body.errors.length > 0) {
      throw new Error(body.errors.map((error) => error.message ?? "Invalid input").join(" "));
    }
    throw new Error(`The backend could not complete the request (${response.status}).`);
  }

  return body as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function ThinkingIndicator() {
  return (
    <div className="thinking-row" role="status" aria-label="Interviewer is thinking">
      <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>
      <span>Interviewer is thinking</span>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="brand-lockup">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span>AI Interview Coach</span>
    </div>
  );
}

export default function InterviewCoach() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [context, setContext] = useState<InterviewContext | null>(null);
  const [conversation, setConversation] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [starting, setStarting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [failedAnswer, setFailedAnswer] = useState<Turn[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation, thinking, screen]);

  async function startInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedTopic = topic.trim();
    if (!selectedTopic) {
      setFormError("Enter a technical topic to start your interview.");
      return;
    }

    setStarting(true);
    setFormError(null);
    const nextContext = { topic: selectedTopic, difficulty };
    try {
      const firstTurn = await postJson<InterviewReply>("/api/interview/start", nextContext);
      setContext(nextContext);
      setConversation([{ role: "interviewer", content: firstTurn.message }]);
      setScreen("interview");
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setStarting(false);
    }
  }

  async function generateReport(
    turns: Turn[] = conversation,
    interviewContext: InterviewContext | null = context,
  ) {
    if (!interviewContext) return;
    setScreen("report");
    setReport(null);
    setReportError(null);
    setReportLoading(true);
    try {
      const result = await postJson<InterviewReport>("/api/report", {
        ...interviewContext,
        conversation: turns,
      });
      setReport(result);
    } catch (error) {
      setReportError(errorMessage(error));
    } finally {
      setReportLoading(false);
    }
  }

  async function requestNextTurn(turns: Turn[], interviewContext: InterviewContext) {
    setThinking(true);
    setChatError(null);
    let reply: InterviewReply;
    try {
      reply = await postJson<InterviewReply>("/api/interview/answer", {
        ...interviewContext,
        conversation: turns,
      });
    } catch (error) {
      setFailedAnswer(turns);
      setChatError(errorMessage(error));
      setThinking(false);
      return;
    }

    const updatedConversation = [
      ...turns,
      { role: "interviewer" as const, content: reply.message },
    ];
    setConversation(updatedConversation);
    setFailedAnswer(null);
    setThinking(false);
    if (reply.ended) {
      await generateReport(updatedConversation, interviewContext);
    }
  }

  async function sendAnswer() {
    const answer = draft.trim();
    if (!answer) {
      setDraftError("Write an answer before sending.");
      return;
    }
    if (!context || thinking || failedAnswer) return;

    const updatedConversation = [...conversation, { role: "candidate" as const, content: answer }];
    setConversation(updatedConversation);
    setDraft("");
    setDraftError(null);
    await requestNextTurn(updatedConversation, context);
  }

  async function retryAnswer() {
    if (!failedAnswer || !context || thinking) return;
    await requestNextTurn(failedAnswer, context);
  }

  function startNewInterview() {
    setScreen("setup");
    setTopic("");
    setDifficulty("Medium");
    setContext(null);
    setConversation([]);
    setDraft("");
    setReport(null);
    setReportError(null);
    setChatError(null);
    setFormError(null);
    setFailedAnswer(null);
  }

  function handleAnswerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendAnswer();
    }
  }

  const scoreTone = report
    ? report.score >= 70
      ? "good"
      : report.score >= 55
        ? "okay"
        : "weak"
    : "weak";

  return (
    <div className="app-shell">
      <header className="topbar">
        <BrandMark />
        <span className="topbar-caption">Technical interview practice</span>
      </header>

      {screen === "setup" && (
        <main className="setup-layout">
          <section className="intro-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> A clearer way to practice</p>
            <h1>AI Interview Coach</h1>
            <p className="intro-tagline">
              Think out loud. Find your edges. Get a sharper read on what you know.
            </p>
            <div className="intro-footer">
              <span className="status-dot" /> One question at a time
              <span className="intro-divider" /> Built for technical interviews
            </div>
          </section>

          <form className="setup-panel" onSubmit={startInterview} noValidate>
            <div className="panel-heading">
              <span className="step-index">01</span>
              <div>
                <h2>Set your focus</h2>
                <p>Choose a topic and the level of challenge.</p>
              </div>
            </div>

            <label className="field-label" htmlFor="topic">Technical topic</label>
            <input
              id="topic"
              className="topic-input"
              type="text"
              autoComplete="off"
              maxLength={160}
              placeholder="e.g. Database indexing"
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
                setFormError(null);
              }}
              disabled={starting}
            />

            <fieldset className="difficulty-fieldset" disabled={starting}>
              <legend className="field-label">Difficulty</legend>
              <div className="difficulty-options">
                {difficulties.map((level) => (
                  <label
                    className={`difficulty-option ${difficulty === level ? "selected" : ""}`}
                    key={level}
                  >
                    <input
                      type="radio"
                      name="difficulty"
                      value={level}
                      checked={difficulty === level}
                      onChange={() => setDifficulty(level)}
                    />
                    <span className="difficulty-name">{level}</span>
                    <span className="difficulty-description">
                      {level === "Easy" ? "Foundations" : level === "Medium" ? "Applied" : "Systems"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {formError && <p className="error-message" role="alert">{formError}</p>}

            <button className="primary-button start-button" type="submit" disabled={starting}>
              {starting ? (
                <><span className="button-spinner" aria-hidden="true" /> Starting interview</>
              ) : (
                <>Start Interview <span aria-hidden="true">&#8594;</span></>
              )}
            </button>
            <p className="form-note">Your conversation stays in this session.</p>
          </form>
        </main>
      )}

      {screen === "interview" && context && (
        <main className="interview-layout">
          <div className="session-heading">
            <div>
              <p className="eyebrow"><span className="status-dot" /> Interview in progress</p>
              <h1>{context.topic}</h1>
            </div>
            <span className={`difficulty-pill difficulty-${context.difficulty.toLowerCase()}`}>
              {context.difficulty}
            </span>
          </div>

          <section className="chat-panel" aria-label="Interview conversation">
            <div className="chat-scroll" role="log" aria-live="polite" aria-relevant="additions">
              {conversation.map((turn, index) => (
                <article className={`message-row ${turn.role}`} key={`${turn.role}-${index}`}>
                  {turn.role === "interviewer" && <span className="message-avatar">AI</span>}
                  <div className="message-content">
                    <span className="message-author">
                      {turn.role === "interviewer" ? "Interviewer" : "You"}
                    </span>
                    <p className="message-bubble">{turn.content}</p>
                  </div>
                </article>
              ))}
              {thinking && <ThinkingIndicator />}
              <div ref={bottomRef} />
            </div>

            {chatError && (
              <div className="inline-error" role="alert">
                <p>{chatError}</p>
                {failedAnswer && (
                  <button className="text-button" type="button" onClick={() => void retryAnswer()}>
                    Retry sending answer
                  </button>
                )}
              </div>
            )}

            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                void sendAnswer();
              }}
            >
              <label className="sr-only" htmlFor="answer">Your answer</label>
              <textarea
                id="answer"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setDraftError(null);
                }}
                onKeyDown={handleAnswerKeyDown}
                placeholder={thinking ? "The interviewer is thinking..." : "Write your answer..."}
                rows={3}
                maxLength={8000}
                disabled={thinking || Boolean(failedAnswer)}
              />
              <div className="composer-footer">
                <div>
                  {draftError ? (
                    <span className="composer-error" role="alert">{draftError}</span>
                  ) : (
                    <span className="keyboard-hint">Enter to send <span>/</span> Shift+Enter for a new line</span>
                  )}
                </div>
                <button
                  className="primary-button send-button"
                  type="submit"
                  disabled={thinking || Boolean(failedAnswer) || !draft.trim()}
                >
                  Send answer <span aria-hidden="true">&#8593;</span>
                </button>
              </div>
            </form>
          </section>
        </main>
      )}

      {screen === "report" && context && (
        <main className="report-layout">
          <div className="report-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> Session report</p>
              <h1>Interview Complete</h1>
              <div className="report-context">
                <span>{context.topic}</span>
                <span className={`difficulty-pill difficulty-${context.difficulty.toLowerCase()}`}>
                  {context.difficulty}
                </span>
              </div>
            </div>
            {!reportLoading && !reportError && (
              <button className="secondary-button new-interview-top" onClick={startNewInterview}>
                Start New Interview
              </button>
            )}
          </div>

          {reportLoading && (
            <section className="report-loading" role="status">
              <span className="large-spinner" aria-hidden="true" />
              <h2>Building your report</h2>
              <p>Reviewing your answers and gathering the key takeaways.</p>
              <div className="report-skeleton" />
            </section>
          )}

          {reportError && !reportLoading && (
            <section className="report-error" role="alert">
              <span className="error-mark" aria-hidden="true">!</span>
              <h2>We couldn&apos;t generate your report</h2>
              <p>{reportError}</p>
              <div className="report-error-actions">
                <button
                  className="primary-button"
                  onClick={() => void generateReport(conversation, context)}
                >
                  Retry report
                </button>
                <button className="secondary-button" onClick={startNewInterview}>
                  Start New Interview
                </button>
              </div>
            </section>
          )}

          {report && !reportLoading && (
            <>
              <section className="score-panel">
                <div className={`score-value ${scoreTone}`}>
                  <span className="score-number">{report.score}</span>
                  <span className="score-denominator">/ 100</span>
                </div>
                <div className="score-copy">
                  <span className={`score-band ${scoreTone}`}>{report.performance_band}</span>
                  <p>
                    {scoreTone === "good"
                      ? "Strong command of the material."
                      : scoreTone === "okay"
                        ? "A solid base with room to sharpen."
                        : "Use the review below to focus your next practice."}
                  </p>
                </div>
                <div className={`result-stamp ${report.result.toLowerCase()}`}>
                  {report.result.toUpperCase()}
                </div>
              </section>

              <div className="report-sections">
                <ReportSection title="Strengths" count={report.strengths.length} tone="positive">
                  {report.strengths.length ? (
                    <ul className="evidence-list">
                      {report.strengths.map((item, index) => (
                        <li key={`${item.evidence}-${index}`}>
                          <p>{item.assessment}</p>
                          <blockquote>&ldquo;{item.evidence}&rdquo;</blockquote>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="empty-section">No specific strengths were identified in the answers.</p>}
                </ReportSection>

                <ReportSection title="Areas for improvement" count={report.weaknesses.length} tone="caution">
                  {report.weaknesses.length ? (
                    <ul className="evidence-list">
                      {report.weaknesses.map((item, index) => (
                        <li key={`${item.evidence}-${index}`}>
                          <p>{item.assessment}</p>
                          <blockquote>&ldquo;{item.evidence}&rdquo;</blockquote>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="empty-section">No specific gaps were identified in the answers.</p>}
                </ReportSection>

                <ReportSection title="Topics to revise" count={report.topics_to_revise.length} tone="neutral">
                  {report.topics_to_revise.length ? (
                    <ul className="topic-list">
                      {report.topics_to_revise.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                    </ul>
                  ) : <p className="empty-section">No additional topics were flagged for revision.</p>}
                </ReportSection>

                <section className="verdict-section">
                  <p className="section-kicker">Interviewer&apos;s verdict</p>
                  <p className="verdict-copy">{report.overall_verdict}</p>
                </section>
              </div>

              <div className="report-footer">
                <button className="primary-button" onClick={startNewInterview}>
                  Start New Interview <span aria-hidden="true">&#8594;</span>
                </button>
              </div>
            </>
          )}
        </main>
      )}

      <footer className="site-footer">
        <span>AI Interview Coach</span>
        <span>Practice with purpose.</span>
      </footer>
    </div>
  );
}

type ReportSectionProps = {
  title: string;
  count: number;
  tone: "positive" | "caution" | "neutral";
  children: React.ReactNode;
};

function ReportSection({ title, count, tone, children }: ReportSectionProps) {
  return (
    <section className={`report-section ${tone}`}>
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="section-count">{count.toString().padStart(2, "0")}</span>
      </div>
      {children}
    </section>
  );
}
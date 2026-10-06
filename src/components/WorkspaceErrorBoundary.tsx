import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { isTauriRuntime } from "../backend";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import packageMetadata from "../../package.json";
import {
  formatRenderFailure,
  recordRenderFailure,
  type RenderFailure,
} from "../app/renderDiagnostics";
import "./WorkspaceErrorBoundary.css";

type Props = {
  name: string;
  children: ReactNode;
  fallbackClassName?: string;
  showFallback?: boolean;
  onDismiss?: () => void;
};
type State = {
  error: Error | null;
  componentStack: string;
  failure: RenderFailure | null;
  generation: number;
  copyStatus: string;
};

/** A view retry remounts its panels while workspace stores and background jobs survive. */
export class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    componentStack: "",
    failure: null,
    generation: 0,
    copyStatus: "",
  };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      copyStatus: "",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const renderError =
      error instanceof Error ? error : new Error(String(error));
    const componentStack = info.componentStack ?? "";
    this.setState({
      componentStack,
      failure: recordRenderFailure(this.props.name, renderError, componentStack),
    });
    console.error(
      `Music Library ${this.props.name} render failed.`,
      error,
      info.componentStack,
    );
  }

  private errorDetails = () => {
    return this.state.failure
      ? formatRenderFailure(this.state.failure)
      : [
          `Music Library ${packageMetadata.version} — ${this.props.name}`,
          this.state.error?.stack || this.state.error?.message,
          this.state.componentStack,
        ]
          .filter(Boolean)
          .join("\n\n");
  };

  private copyDetails = async () => {
    const details = this.errorDetails();
    try {
      if (isTauriRuntime()) {
        await writeText(details);
      } else {
        await navigator.clipboard.writeText(details);
      }
      this.setState({ copyStatus: "Error details copied." });
    } catch {
      this.setState({
        copyStatus:
          "Could not copy. Select the error details below to copy them.",
      });
    }
  };

  render() {
    if (!this.state.error) {
      return (
        <Fragment key={this.state.generation}>{this.props.children}</Fragment>
      );
    }
    if (this.props.showFallback === false) return null;
    return (
      <section
        className={`workspace-render-error ${this.props.fallbackClassName ?? ""}`.trim()}
        role="alert"
        aria-label={`${this.props.name} error`}
      >
        <h2>{this.props.name} could not be displayed</h2>
        <p>
          Your library and background jobs are still available. You can retry
          this view or open another workspace.
        </p>
        <div className="workspace-render-error-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              this.setState((state) => ({
                error: null,
                componentStack: "",
                failure: null,
                copyStatus: "",
                generation: state.generation + 1,
              }))
            }
          >
            Reload this view
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void this.copyDetails()}
          >
            Copy error details
          </button>
          {this.props.onDismiss ? (
            <button
              type="button"
              className="secondary-button"
              onClick={this.props.onDismiss}
            >
              Close {this.props.name}
            </button>
          ) : null}
        </div>
        <details>
          <summary>Error details</summary>
          <pre>{this.errorDetails()}</pre>
        </details>
        {this.state.copyStatus ? (
          <p role="status">{this.state.copyStatus}</p>
        ) : null}
      </section>
    );
  }
}

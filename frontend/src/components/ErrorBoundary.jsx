import { Component } from 'react';
import { Link } from 'react-router-dom';

/**
 * Catches render errors so one broken page never blanks the entire app.
 * Without this, an uncaught throw in React 18 unmounts the whole tree
 * (header and all). It also surfaces the error message for debugging.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('StockSense page error:', error, info);
    this.setState({ componentStack: info?.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-2xl mx-auto py-16 text-center">
          <p className="text-5xl mb-4">⚠️</p>
          <h1 className="text-xl font-bold text-white mb-2">Something hiccupped on this page</h1>
          <p className="text-slate-400 text-sm mb-5">
            The rest of StockSense still works — go back and try again. (Details below for debugging.)
          </p>
          <pre className="text-left text-xs text-red-400 bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-auto mb-3 whitespace-pre-wrap max-h-48">
            {String(this.state.error?.message || this.state.error)}
            {this.state.error?.stack ? '\n\n' + this.state.error.stack : ''}
          </pre>
          {this.state.componentStack && (
            <pre className="text-left text-xs text-amber-400 bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-auto mb-6 whitespace-pre-wrap max-h-48">
              Component tree:{this.state.componentStack}
            </pre>
          )}
          <Link
            to="/"
            onClick={() => this.setState({ error: null })}
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
          >
            ← Back to Market
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}

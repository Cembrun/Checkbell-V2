import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  componentDidCatch(error, info) {
    // Save for rendering and also print to console for debugging
    console.error('ErrorBoundary caught error:', error, info);
    this.setState({ error, info });
  }

  render() {
    const { error, info } = this.state;
    if (error) {
      return (
        <div className="p-4 bg-red-900 text-white rounded">
          <h3 className="font-bold">Fehler in der Komponente</h3>
          <div className="text-sm mt-2">{String(error?.message || error)}</div>
          <details className="mt-2 text-xs text-gray-200">
            <summary>Stack / Info</summary>
            <pre className="whitespace-pre-wrap">{info?.componentStack || (error && error.stack)}</pre>
          </details>
        </div>
      );
    }
    return this.props.children || null;
  }
}

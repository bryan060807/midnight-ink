"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="initial-loading">
      <h1>The studio needs a moment.</h1>
      <p>Your saved work is still in your local database.</p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}

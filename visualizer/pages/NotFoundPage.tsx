import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="font-wide text-3xl font-[700]">That page doesn't exist</h1>
      <p className="mt-3 text-ink-muted">The address may be mistyped, or the stage may have moved.</p>
      <p className="mt-6">
        <Link to="/stages/requirements" className="text-ram underline underline-offset-4">
          Go to the first stage
        </Link>
      </p>
    </main>
  );
}

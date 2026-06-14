import { Card, CardContent } from '../../components/ui/card';
import { Link } from 'react-router-dom';
export const PublicNotice = () => (
  <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto flex flex-col min-h-[calc(100vh-4rem)]">
    <header className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-slate-800">Public Notice Panel</h1>
      <Link to="/login" className="text-brand hover:underline font-medium text-sm">Staff Login →</Link>
    </header>
    <Card className="flex-1">
      <CardContent className="p-8 text-center h-full flex flex-col justify-center">
        <p className="text-slate-600">Anonymized public notices and hospital updates appear here.</p>
      </CardContent>
    </Card>
  </div>
);
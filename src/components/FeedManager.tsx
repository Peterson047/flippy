'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  SheetDescription, SheetFooter, SheetClose,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import type { FeedSource } from '@/types';
import { PlusCircle, Trash2, Search, RotateCw, Eye, EyeOff, ListChecks, Link, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { discoverFeed, type FeedSuggestion } from '@/app/actions';

interface FeedManagerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  feedSources: FeedSource[];
  onFeedSourcesChange: (feedSources: FeedSource[]) => void;
  seenArticleIds: string[];
  onSeenArticleIdsChange: (ids: string[]) => void;
}

export default function FeedManager({
  isOpen,
  onOpenChange,
  feedSources,
  onFeedSourcesChange,
  seenArticleIds,
  onSeenArticleIdsChange,
}: FeedManagerProps) {
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<FeedSuggestion[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const { toast } = useToast();

  const handleAddFeed = () => {
    if (!newFeedName.trim() || !newFeedUrl.trim()) {
      toast({ title: 'Preencha o nome e a URL do feed.', variant: 'destructive' });
      return;
    }
    try {
      new URL(newFeedUrl);
    } catch {
      toast({ title: 'URL inválida', description: 'Insira uma URL completa (ex: https://...)', variant: 'destructive' });
      return;
    }
    if (feedSources.some(f => f.url === newFeedUrl.trim())) {
      toast({ title: 'Feed já existe', description: 'Este feed já está na sua lista.', variant: 'destructive' });
      return;
    }

    const newFeed: FeedSource = {
      id: Date.now().toString(),
      name: newFeedName.trim(),
      url: newFeedUrl.trim(),
      isHidden: false,
    };
    onFeedSourcesChange([...feedSources, newFeed]);
    setNewFeedName('');
    setNewFeedUrl('');
    toast({ title: 'Feed adicionado', description: `"${newFeed.name}" foi adicionado.` });
  };

  const handleRemoveFeed = (id: string) => {
    onFeedSourcesChange(feedSources.filter(f => f.id !== id));
    toast({ title: 'Feed removido.' });
  };

  const handleToggleVisibility = (id: string) => {
    const updated = feedSources.map(f => f.id === id ? { ...f, isHidden: !f.isHidden } : f);
    onFeedSourcesChange(updated);
    const feed = updated.find(f => f.id === id);
    toast({ title: feed?.isHidden ? 'Feed oculto' : 'Feed visível', description: `"${feed?.name}"` });
  };

  const handleDiscover = async () => {
    if (!searchQuery.trim()) {
      toast({ title: 'Digite um tópico ou URL para buscar.', variant: 'destructive' });
      return;
    }

    setIsSearching(true);
    setSuggestions([]);
    setSearchDone(false);

    try {
      const results = await discoverFeed(searchQuery);
      setSuggestions(results);
      setSearchDone(true);
    } catch {
      toast({ title: 'Erro ao buscar feed.', description: 'Tente novamente mais tarde.', variant: 'destructive' });
      setSearchDone(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddSuggestion = (suggestion: FeedSuggestion) => {
    if (feedSources.some(f => f.url === suggestion.url)) {
      toast({ title: 'Feed já existe', description: `"${suggestion.name}" já está na sua lista.`, variant: 'destructive' });
      return;
    }
    onFeedSourcesChange([...feedSources, {
      id: Date.now().toString(),
      name: suggestion.name,
      url: suggestion.url,
      isHidden: false,
    }]);
    setSuggestions(prev => prev.filter(s => s.url !== suggestion.url));
    toast({ title: 'Feed adicionado', description: `"${suggestion.name}" foi adicionado.` });
  };

  const handleClearHistory = () => {
    onSeenArticleIdsChange([]);
    toast({ title: 'Histórico limpo', description: 'Todas as notícias voltarão a aparecer.' });
  };

  const visibleCount = feedSources.filter(f => !f.isHidden).length;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="bg-card text-card-foreground w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="p-6 border-b border-border">
          <SheetTitle className="font-headline text-2xl">Configurações</SheetTitle>
          <SheetDescription>
            Gerencie seus feeds e histórico de leitura.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-grow p-6 space-y-6 overflow-y-auto no-scrollbar">

          {/* Descobrir feed */}
          <div className="space-y-3 p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h3 className="font-headline text-base font-semibold">Encontrar Feed</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Cole uma URL de site/feed ou escreva um tópico (ex: "futebol", "tecnologia", "BBC Brasil").
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="tecnologia, g1.globo.com, https://..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSuggestions([]); setSearchDone(false); }}
                className="bg-input text-foreground placeholder:text-muted-foreground flex-grow"
                disabled={isSearching}
                onKeyDown={e => { if (e.key === 'Enter' && !isSearching) handleDiscover(); }}
              />
              <Button
                onClick={handleDiscover}
                disabled={isSearching || !searchQuery.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 shrink-0"
              >
                {isSearching ? <RotateCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {/* Sugestões */}
            {isSearching && (
              <div className="text-xs text-muted-foreground text-center py-2 animate-pulse">
                Buscando feeds compatíveis...
              </div>
            )}

            {!isSearching && searchDone && suggestions.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-2">
                Nenhum feed compatível encontrado. Tente outro termo ou cole a URL do feed.
              </div>
            )}

            {suggestions.length > 0 && (
              <ul className="space-y-2 pt-1">
                {suggestions.map(s => {
                  const alreadyAdded = feedSources.some(f => f.url === s.url);
                  return (
                    <li
                      key={s.url}
                      className="flex items-center justify-between gap-2 p-2.5 bg-background/60 border border-border/50 rounded-md"
                    >
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.url}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={alreadyAdded ? 'secondary' : 'default'}
                        disabled={alreadyAdded}
                        onClick={() => handleAddSuggestion(s)}
                        className="shrink-0 text-xs"
                      >
                        {alreadyAdded ? 'Adicionado' : '+ Adicionar'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Adicionar feed manualmente */}
          <div className="space-y-3 p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <Link className="h-4 w-4 text-primary" />
              <h3 className="font-headline text-base font-semibold">Adicionar Manualmente</h3>
            </div>
            <Input
              placeholder="Nome (ex: G1 Brasil)"
              value={newFeedName}
              onChange={e => setNewFeedName(e.target.value)}
              className="bg-input text-foreground placeholder:text-muted-foreground"
            />
            <Input
              type="url"
              placeholder="URL do feed RSS (https://...)"
              value={newFeedUrl}
              onChange={e => setNewFeedUrl(e.target.value)}
              className="bg-input text-foreground placeholder:text-muted-foreground"
              onKeyDown={e => { if (e.key === 'Enter') handleAddFeed(); }}
            />
            <Button onClick={handleAddFeed} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Feed
            </Button>
          </div>

          {/* Histórico */}
          <div className="space-y-3 p-4 border border-border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <h3 className="font-headline text-base font-semibold">Histórico de Leitura</h3>
              </div>
              {seenArticleIds.length > 0 && (
                <Badge variant="secondary">{seenArticleIds.length} lidas</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Notícias já vistas ficam marcadas para não aparecerem novamente. O histórico é salvo no seu dispositivo.
            </p>
            <Button
              onClick={handleClearHistory}
              variant="outline"
              className="w-full"
              disabled={seenArticleIds.length === 0}
            >
              Limpar Histórico
            </Button>
          </div>

          {/* Lista de feeds */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-headline text-base font-semibold">Meus Feeds</h3>
              <span className="text-xs text-muted-foreground">
                {visibleCount} ativo{visibleCount !== 1 ? 's' : ''}
              </span>
            </div>

            {feedSources.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                Nenhum feed adicionado ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {feedSources.map(feed => (
                  <li
                    key={feed.id}
                    className={`flex items-center justify-between p-3 bg-background/50 rounded-md border border-border/50 transition-opacity ${feed.isHidden ? 'opacity-50' : 'opacity-100'}`}
                  >
                    <div className="flex-1 overflow-hidden mr-2">
                      <p
                        className={`font-medium text-sm text-foreground truncate ${feed.isHidden ? 'line-through' : ''}`}
                        title={feed.name}
                      >
                        {feed.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate" title={feed.url}>
                        {feed.url}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleVisibility(feed.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/10"
                        aria-label={feed.isHidden ? 'Mostrar feed' : 'Ocultar feed'}
                      >
                        {feed.isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveFeed(feed.id)}
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        aria-label="Remover feed"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <SheetFooter className="p-6 border-t border-border">
          <SheetClose asChild>
            <Button variant="outline" className="w-full">Fechar</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

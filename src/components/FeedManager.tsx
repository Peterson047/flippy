
"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from "@/components/ui/sheet";
import type { FeedSource } from '@/types';
import { PlusCircle, Trash2, Search, RotateCw, Eye, EyeOff, ListChecks } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { findRssFeed, type FindRssFeedOutput } from '@/ai/flows/find-rss-feed-flow';

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
  onSeenArticleIdsChange
}: FeedManagerProps) {
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingFeed, setIsSearchingFeed] = useState(false);
  const { toast } = useToast();

  const handleAddFeed = () => {
    if (!newFeedName.trim() || !newFeedUrl.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira um nome e uma URL para o feed.",
        variant: "destructive",
      });
      return;
    }
    try {
      new URL(newFeedUrl);
    } catch (_) {
      toast({
        title: "URL Inválida",
        description: "Por favor, insira uma URL válida para o feed.",
        variant: "destructive",
      });
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
    toast({
      title: "Feed Adicionado",
      description: `"${newFeed.name}" foi adicionado.`,
    });
  };

  const handleRemoveFeed = (id: string) => {
    onFeedSourcesChange(feedSources.filter(feed => feed.id !== id));
    toast({
      title: "Feed Removido",
      description: "A fonte do feed foi removida.",
    });
  };

  const handleToggleFeedVisibility = (id: string) => {
    const updatedFeeds = feedSources.map(feed => 
      feed.id === id ? { ...feed, isHidden: !feed.isHidden } : feed
    );
    onFeedSourcesChange(updatedFeeds);
    const targetFeed = updatedFeeds.find(f => f.id === id);
    toast({
      title: `Feed ${targetFeed?.isHidden ? "Oculto" : "Visível"}`,
      description: `"${targetFeed?.name}" agora está ${targetFeed?.isHidden ? "oculto" : "visível"}.`,
    });
  };

  const handleSearchFeed = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Busca Inválida",
        description: "Por favor, insira um tópico para buscar.",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingFeed(true);
    toast({
      title: "Buscando Feed com IA...",
      description: `Procurando por feeds sobre "${searchQuery}". Leva alguns segundos...`,
    });

    try {
      const result: FindRssFeedOutput = await findRssFeed({ query: searchQuery });
      if (result.found && result.suggestedName && result.suggestedUrl) {
        setNewFeedName(result.suggestedName);
        setNewFeedUrl(result.suggestedUrl);
        toast({
          title: "Feed Encontrado pela IA!",
          description: "Os campos de nome e URL foram preenchidos. Verifique e clique em 'Adicionar Feed'.",
          variant: "default",
        });
      } else {
        toast({
          title: "Nenhum Feed Encontrado",
          description: "A IA não encontrou um feed RSS para este tópico. Tente uma busca diferente ou adicione manualmente.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error searching for feed:", error);
      let errorMessage = "Ocorreu um erro ao buscar o feed com a IA. Tente novamente mais tarde.";
      if (error instanceof Error && (error.message.includes('429') || error.message.toLowerCase().includes('quota') || error.message.toLowerCase().includes('rate limit'))) {
          errorMessage = "A busca por feed com IA está indisponível devido a limites da API. Por favor, tente novamente mais tarde ou adicione manualmente.";
      }
      toast({
        title: "Erro na Busca com IA",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSearchingFeed(false);
    }
  };

  const handleClearSeenHistory = () => {
    onSeenArticleIdsChange([]);
    toast({
      title: "Histórico Limpo",
      description: "Todas as marcações de notícias vistas foram removidas.",
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="bg-card text-card-foreground w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="p-6 border-b border-border">
          <SheetTitle className="font-headline text-2xl">Gerenciar Fontes e Histórico</SheetTitle>
          <SheetDescription>
            Adicione, remova, oculte feeds ou limpe seu histórico de notícias vistas.
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-grow p-6 space-y-6 overflow-y-auto no-scrollbar">
          <div className="space-y-4 p-4 border border-border rounded-lg shadow">
            <h3 className="font-headline text-lg font-semibold">Encontrar Feed por Tópico (IA)</h3>
            <div className="flex gap-2 items-center">
              <Input
                type="text"
                placeholder="Ex: Tecnologia no Brasil"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-input text-foreground placeholder:text-muted-foreground flex-grow"
                disabled={isSearchingFeed}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isSearchingFeed && searchQuery.trim()) handleSearchFeed(); }}
              />
              <Button 
                onClick={handleSearchFeed} 
                disabled={isSearchingFeed || !searchQuery.trim()} 
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-3"
                aria-label="Buscar feed com IA"
              >
                {isSearchingFeed ? <RotateCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2 hidden xs:inline">Buscar</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A IA tentará encontrar um feed RSS relevante. Os resultados podem variar.
            </p>
          </div>

          <div className="space-y-4 p-4 border border-border rounded-lg shadow">
            <h3 className="font-headline text-lg font-semibold">Adicionar Novo Feed Manualmente</h3>
            <Input
              type="text"
              placeholder="Nome do Feed (Ex: G1 - Brasil)"
              value={newFeedName}
              onChange={(e) => setNewFeedName(e.target.value)}
              className="bg-input text-foreground placeholder:text-muted-foreground"
            />
            <Input
              type="url"
              placeholder="URL do Feed (Ex: https://g1.globo.com/...)"
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              className="bg-input text-foreground placeholder:text-muted-foreground"
            />
            <Button onClick={handleAddFeed} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Feed
            </Button>
          </div>

          <div className="space-y-4 p-4 border border-border rounded-lg shadow">
            <h3 className="font-headline text-lg font-semibold">Histórico de Visualização</h3>
            <Button 
              onClick={handleClearSeenHistory} 
              variant="outline" 
              className="w-full"
              disabled={seenArticleIds.length === 0}
            >
              <ListChecks className="mr-2 h-4 w-4" /> 
              Limpar {seenArticleIds.length} Notícia(s) Vista(s)
            </Button>
            <p className="text-xs text-muted-foreground">
              Notícias marcadas como vistas não serão exibidas novamente até que o histórico seja limpo.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="font-headline text-lg font-semibold">Feeds Atuais</h3>
            {feedSources.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum feed adicionado ainda.</p>
            ) : (
              <ul className="space-y-3">
                {feedSources.map(feed => (
                  <li 
                    key={feed.id} 
                    className={`flex items-center justify-between p-3 bg-background/50 rounded-md shadow-sm transition-opacity ${feed.isHidden ? 'opacity-60' : 'opacity-100'}`}
                  >
                    <div className="flex-1 overflow-hidden">
                      <p 
                        className={`font-medium text-foreground truncate ${feed.isHidden ? 'line-through' : ''}`} 
                        title={feed.name}
                      >
                        {feed.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate" title={feed.url}>{feed.url}</p>
                    </div>
                    <div className="flex items-center ml-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleToggleFeedVisibility(feed.id)} 
                        className="text-muted-foreground hover:text-foreground hover:bg-white/10 flex-shrink-0"
                        aria-label={feed.isHidden ? `Mostrar feed ${feed.name}` : `Ocultar feed ${feed.name}`}
                      >
                        {feed.isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveFeed(feed.id)} 
                        className="text-destructive hover:bg-destructive/10 flex-shrink-0"
                        aria-label={`Remover feed ${feed.name}`}
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


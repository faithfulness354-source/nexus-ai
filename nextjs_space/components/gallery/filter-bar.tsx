'use client';

import { Search, X, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FilterBarProps {
  search: string;
  onSearchChange: (s: string) => void;
  selectedTag: string;
  onTagChange: (t: string) => void;
  allTags: string[];
  /** Search lives in the top bar on desktop; only render it here below md. */
  searchInHeader?: boolean;
}

const ALL = '__all__';

export function SearchInput({ value, onChange, className }: { value: string; onChange: (s: string) => void; className?: string }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        aria-label="Search characters"
        placeholder="Search characters, scenarios, creators…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-full bg-secondary/80 pl-10 pr-10 text-sm placeholder:text-muted-foreground outline-none ring-1 ring-border/60 focus:ring-primary/60 transition [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange('')} className="absolute right-3 top-1/2 -translate-y-1/2">
          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </button>
      )}
    </div>
  );
}

export function FilterBar({ search, onSearchChange, selectedTag, onTagChange, allTags, searchInHeader }: FilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          className={cn('w-full sm:flex-1', searchInHeader && 'md:hidden')}
        />
        {searchInHeader && <div className="hidden md:block flex-1" />}

        {/* Tag filter */}
        <Select value={selectedTag || ALL} onValueChange={(v) => onTagChange(v === ALL ? '' : v)}>
          <SelectTrigger aria-label="Filter by tag" className="h-10 flex-1 sm:flex-none sm:w-44 rounded-full bg-secondary/80 border-0">
            <Tag className="h-4 w-4 text-muted-foreground mr-1 shrink-0" />
            <SelectValue placeholder="All tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tags</SelectItem>
            {allTags.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quick tag pills */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0">
          {['', ...allTags].map((tag) => (
            <button
              key={tag || ALL}
              onClick={() => onTagChange(tag === selectedTag ? '' : tag)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                selectedTag === tag
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/70 text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              {tag ? `#${tag}` : 'All'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

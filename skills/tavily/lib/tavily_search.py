#!/usr/bin/env python3
import sys
import os
import json
import argparse

try:
    from tavily import TavilyClient
except ImportError:
    print("Error: tavily-python is not installed.")
    print("Run: pip install tavily-python")
    sys.exit(1)

def get_client():
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        print("Error: TAVILY_API_KEY environment variable is not set.")
        print("\nTo get your API key:")
        print("  1. Go to https://app.tavily.com")
        print("  2. Sign up / log in")
        print("  3. Copy your API key")
        print("  4. Set it: set TAVILY_API_KEY=tvly-...")
        print("     Or in OpenClaw config.json:")
        print('     { "env": { "TAVILY_API_KEY": "tvly-..." } }')
        sys.exit(1)
    return TavilyClient(api_key=api_key)

def cmd_search(args):
    client = get_client()
    kwargs = {}
    if args.answer: kwargs['answer'] = True
    if args.depth: kwargs['search_depth'] = args.depth
    if args.time: kwargs['topic'] = args.topic or 'general'; kwargs['time_range'] = args.time
    if args.include_domains: kwargs['include_domains'] = args.include_domains.split(',')
    if args.exclude_domains: kwargs['exclude_domains'] = args.exclude_domains.split(',')
    if args.country: kwargs['country'] = args.country
    if args.raw: kwargs['include_raw_content'] = True
    if args.images: kwargs['include_images'] = True

    topic = args.topic or 'general'
    kwargs['topic'] = topic
    kwargs['query'] = args.query
    kwargs['max_results'] = args.max_results or 5

    try:
        result = client.search(**kwargs)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    if 'answer' in result and result['answer']:
        print(f"Answer: {result['answer']}\n")
    if 'results' in result and result['results']:
        print("Results:")
        for i, r in enumerate(result['results'], 1):
            print(f"  {i}. {r.get('title', '')}")
            print(f"     {r.get('url', '')}")
            print(f"     {r.get('content', '')[:200]}...")
            print()
    else:
        print("No results found.")

def cmd_news(args):
    args.topic = 'news'
    cmd_search(args)

def cmd_finance(args):
    args.topic = 'finance'
    cmd_search(args)

def cmd_extract(args):
    client = get_client()
    kwargs = {}
    if args.depth: kwargs['depth'] = args.depth
    if args.format: kwargs['format'] = args.format
    if args.query: kwargs['query'] = args.query

    try:
        result = client.extract(urls=args.urls, **kwargs)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    for item in result.get('results', []):
        print(f"URL: {item.get('url', '')}")
        print("─" * 60)
        print(item.get('raw_content', item.get('content', '')))
        print()

def cmd_crawl(args):
    client = get_client()
    kwargs = {}
    if args.depth: kwargs['depth'] = args.depth
    if args.max_depth: kwargs['max_depth'] = args.max_depth
    if args.max_breadth: kwargs['max_breadth'] = args.max_breadth
    if args.limit: kwargs['max_results'] = args.limit
    if args.instructions: kwargs['instructions'] = args.instructions
    if args.select_paths: kwargs['include_paths'] = args.select_paths.split(',')
    if args.exclude_paths: kwargs['exclude_paths'] = args.exclude_paths.split(',')
    if args.format: kwargs['format'] = args.format

    try:
        result = client.crawl(url=args.url, **kwargs)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    pages = result.get('results', [])
    print(f"Crawled {len(pages)} pages from {args.url}\n")
    for i, page in enumerate(pages, 1):
        print(f"Page {i}: {page.get('url', '')}")
        print("─" * 60)
        print(page.get('content', '')[:500])
        print()

def cmd_map(args):
    client = get_client()
    kwargs = {}
    if args.max_depth: kwargs['max_depth'] = args.max_depth
    if args.max_breadth: kwargs['max_breadth'] = args.max_breadth
    if args.limit: kwargs['max_results'] = args.limit

    try:
        result = client.map(url=args.url, **kwargs)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    urls = result.get('urls', [])
    print(f"Sitemap for {args.url} ({len(urls)} URLs found):\n")
    for i, u in enumerate(urls, 1):
        print(f"  {i}. {u}")
    print()

def cmd_research(args):
    client = get_client()
    kwargs = {'query': args.query}
    if args.model: kwargs['model'] = args.model

    try:
        result = client.research(**kwargs)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    print(f"Research: {args.query}\n")
    if 'answer' in result:
        print(result['answer'])
        print()
    if 'sources' in result and result['sources']:
        print("Sources:")
        for i, s in enumerate(result['sources'], 1):
            print(f"  [{i}] {s.get('url', '')}")
    print()

def main():
    parser = argparse.ArgumentParser(description='Tavily AI Search CLI', prog='tavily_search.py')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # search
    sp = subparsers.add_parser('search', help='Web search')
    sp.add_argument('query', help='Search query')
    sp.add_argument('--answer', action='store_true', help='Include LLM answer')
    sp.add_argument('--depth', choices=['basic', 'advanced'], help='Search depth')
    sp.add_argument('--time', choices=['day', 'week', 'month', 'year'], help='Time range')
    sp.add_argument('--topic', help='Topic override')
    sp.add_argument('-n', '--max-results', type=int, help='Max results')
    sp.add_argument('--include-domains', help='Comma-separated domains')
    sp.add_argument('--exclude-domains', help='Comma-separated domains')
    sp.add_argument('--country', help='Country code')
    sp.add_argument('--raw', action='store_true', help='Include raw content')
    sp.add_argument('--images', action='store_true', help='Include image URLs')
    sp.add_argument('--json', action='store_true', help='JSON output')
    sp.set_defaults(func=cmd_search)

    # news
    sp = subparsers.add_parser('news', help='News search')
    sp.add_argument('query', help='Search query')
    sp.add_argument('--answer', action='store_true', help='Include LLM answer')
    sp.add_argument('--depth', choices=['basic', 'advanced'], help='Search depth')
    sp.add_argument('--time', choices=['day', 'week', 'month', 'year'], help='Time range')
    sp.add_argument('-n', '--max-results', type=int, help='Max results')
    sp.add_argument('--raw', action='store_true', help='Include raw content')
    sp.add_argument('--images', action='store_true', help='Include image URLs')
    sp.add_argument('--json', action='store_true', help='JSON output')
    sp.set_defaults(func=cmd_search)

    # finance
    sp = subparsers.add_parser('finance', help='Finance search')
    sp.add_argument('query', help='Search query')
    sp.add_argument('--answer', action='store_true', help='Include LLM answer')
    sp.add_argument('--depth', choices=['basic', 'advanced'], help='Search depth')
    sp.add_argument('--time', choices=['day', 'week', 'month', 'year'], help='Time range')
    sp.add_argument('-n', '--max-results', type=int, help='Max results')
    sp.add_argument('--raw', action='store_true', help='Include raw content')
    sp.add_argument('--images', action='store_true', help='Include image URLs')
    sp.add_argument('--json', action='store_true', help='JSON output')
    sp.set_defaults(func=cmd_search)

    # extract
    sp = subparsers.add_parser('extract', help='Extract content from URLs')
    sp.add_argument('urls', nargs='+', help='URLs to extract')
    sp.add_argument('--depth', choices=['basic', 'advanced'], help='Extraction depth')
    sp.add_argument('--format', choices=['markdown', 'text'], help='Output format')
    sp.add_argument('--query', help='Relevance reranking query')
    sp.add_argument('--json', action='store_true', help='JSON output')
    sp.set_defaults(func=cmd_extract)

    # crawl
    sp = subparsers.add_parser('crawl', help='Crawl a website')
    sp.add_argument('url', help='Root URL to crawl')
    sp.add_argument('--depth', choices=['basic', 'advanced'], help='Crawl depth')
    sp.add_argument('--max-depth', type=int, help='Max link depth')
    sp.add_argument('--max-breadth', type=int, help='Max pages per level')
    sp.add_argument('--limit', type=int, help='Max total pages')
    sp.add_argument('--instructions', help='Natural language instructions')
    sp.add_argument('--select-paths', help='Comma-separated path patterns')
    sp.add_argument('--exclude-paths', help='Comma-separated path patterns')
    sp.add_argument('--format', choices=['markdown', 'text'], help='Output format')
    sp.add_argument('--json', action='store_true', help='JSON output')
    sp.set_defaults(func=cmd_crawl)

    # map
    sp = subparsers.add_parser('map', help='Discover site URLs (sitemap)')
    sp.add_argument('url', help='Root URL to map')
    sp.add_argument('--max-depth', type=int, help='Max link depth')
    sp.add_argument('--max-breadth', type=int, help='Max breadth per level')
    sp.add_argument('--limit', type=int, help='Max URLs')
    sp.add_argument('--json', action='store_true', help='JSON output')
    sp.set_defaults(func=cmd_map)

    # research
    sp = subparsers.add_parser('research', help='Deep research with citations')
    sp.add_argument('query', help='Research question')
    sp.add_argument('--model', choices=['mini', 'pro', 'auto'], help='Research model')
    sp.add_argument('--json', action='store_true', help='JSON output')
    sp.set_defaults(func=cmd_research)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    args.func(args)

if __name__ == '__main__':
    main()
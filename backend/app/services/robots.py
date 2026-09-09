import urllib.robotparser
from urllib.parse import urlparse
import httpx
from typing import Dict

class RobotsParserService:
    def __init__(self):
        self._parsers: Dict[str, urllib.robotparser.RobotFileParser] = {}

    async def get_parser(self, url: str) -> urllib.robotparser.RobotFileParser:
        parsed_url = urlparse(url)
        domain = f"{parsed_url.scheme}://{parsed_url.netloc}"
        
        if domain not in self._parsers:
            robots_url = f"{domain}/robots.txt"
            parser = urllib.robotparser.RobotFileParser()
            parser.set_url(robots_url)
            try:
                # Fetching robots.txt asynchronously with standard headers
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'}
                async with httpx.AsyncClient(headers=headers, verify=False) as client:
                    response = await client.get(robots_url, timeout=5.0)
                    if response.status_code == 200:
                        parser.parse(response.text.splitlines())
                    else:
                        parser.parse(["User-agent: *", "Allow: /"])
            except Exception:
                # If fetching fails, we'll assume everything is allowed
                parser.parse(["User-agent: *", "Allow: /"])
            self._parsers[domain] = parser
            
        return self._parsers[domain]

    async def is_allowed(self, url: str, user_agent: str = "*") -> bool:
        parser = await self.get_parser(url)
        return parser.can_fetch(user_agent, url)
        
    async def get_crawl_delay(self, url: str, user_agent: str = "*") -> float:
        parser = await self.get_parser(url)
        delay = parser.crawl_delay(user_agent)
        return float(delay) if delay else 0.0

robots_service = RobotsParserService()

Torrent Chain:
A versioning and Reputation system to maintain a chain of torrents in a pure decentralized fashion

to run:

make sure your ipfs daemon is running:

> ipfs daemon

run the ipfs server in /ipfs-go-server:

> go run cmd/main.go

have a blockchain wallet, ganache test environment used in this scenario,
connect ganache wallets to metamask.

run the blockchain express server in /blockchain 

> npm install && node server.js

run the main backend server in /main_backend

> npm install && node index.js

run the frontend server in /frontend

> npm install && npm run dev


Tech Stack Used:

Svelte - Frontend
IPFS - Database
Webtorrent - File Transmission protocol
Ganache - Ethereum - Blockchain - Transaction Protocol
Node js - GoLang - Backend


# IPFS Go Server

This project is a simple server built in Go that utilizes IPFS (InterPlanetary File System) to manage a table of strings. It allows users to append strings to a table, generate a unique IPNS (InterPlanetary Naming System) identifier for the table, and fetch the latest added string or all added strings using the IPNS nickname.

## Features

- Append strings to a table.
- Generate and manage a unique IPNS identifier for the table.
- Fetch the latest added string.
- Fetch all added strings.

## Project Structure

```
ipfs-go-server
├── cmd
│   └── main.go          # Entry point of the application
├── internal
│   ├── handlers
│   │   └── table.go     # HTTP request handlers for the table
│   ├── ipfs
│   │   ├── client.go     # IPFS client management
│   │   └── ipns.go       # IPNS record management
│   ├── models
│   │   └── table.go      # Table data structure and methods
│   └── storage
│       └── storage.go    # Storage management for table data
├── pkg
│   └── utils
│       └── utils.go      # Utility functions
├── go.mod                # Module definition
├── go.sum                # Dependency checksums
└── README.md             # Project documentation
```

## Setup Instructions

1. Clone the repository:
   ```
   git clone <repository-url>
   cd ipfs-go-server
   ```

2. Install dependencies:
   ```
   go mod tidy
   ```

3. Run the server:
   ```
   go run cmd/main.go
   ```

## Usage

- To append a string to the table, send a POST request to `/append` with the string in the request body.
- To fetch the latest added string, send a GET request to `/latest`.
- To fetch all added strings, send a GET request to `/all`.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
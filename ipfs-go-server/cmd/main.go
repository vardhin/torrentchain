package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"ipfs-go-server/internal/handlers"
	"ipfs-go-server/internal/ipfs"

	"github.com/gorilla/mux"
)

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[SERVER] %s %s - Headers: %v", r.Method, r.URL.Path, r.Header)
		log.Printf("[SERVER] Remote Address: %s", r.RemoteAddr)
		log.Printf("[SERVER] User-Agent: %s", r.Header.Get("User-Agent"))
		log.Printf("[SERVER] Content-Type: %s", r.Header.Get("Content-Type"))
		log.Printf("[SERVER] Content-Length: %s", r.Header.Get("Content-Length"))

		// Call the next handler
		next.ServeHTTP(w, r)
	})
}

func main() {
	// Set up detailed logging
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.SetOutput(os.Stdout)

	log.Println("[MAIN] Starting IPFS Table Server...")

	// Initialize IPFS client with default API address
	log.Println("[MAIN] Initializing IPFS client on localhost:5001")
	ipfsClient := ipfs.NewIPFSClient("localhost:5001")

	// Initialize handlers with persistence
	log.Println("[MAIN] Initializing handlers with persistence...")
	if err := handlers.InitializeStorage(ipfsClient); err != nil {
		log.Printf("[MAIN] Warning: Failed to load existing tables: %v", err)
	}

	router := mux.NewRouter()

	// Add logging middleware
	router.Use(loggingMiddleware)

	// Add a root handler
	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[ROOT] Root endpoint called")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		response := `{"message": "IPFS Table Server is running", "status": "ok"}`
		log.Printf("[ROOT] Sending response: %s", response)
		w.Write([]byte(response))
	}).Methods("GET")

	log.Println("[MAIN] Registering table routes...")
	handlers.RegisterTableRoutes(router, ipfsClient)

	// Log all registered routes - Fixed version
	router.Walk(func(route *mux.Route, router *mux.Router, ancestors []*mux.Route) error {
		pathTemplate, pathErr := route.GetPathTemplate()
		methods, methodsErr := route.GetMethods()

		if pathErr == nil && methodsErr == nil {
			log.Printf("[ROUTES] Registered: %v %s", methods, pathTemplate)
		} else {
			// Better fallback handling
			if methodsErr == nil {
				log.Printf("[ROUTES] Registered: %v [path parsing failed]", methods)
			} else {
				log.Printf("[ROUTES] Registered: [unable to parse route]")
			}
		}
		return nil
	})

	// Configure server with timeouts and larger body limits
	server := &http.Server{
		Addr:           ":8081",
		Handler:        router,
		ReadTimeout:    30 * time.Second,
		WriteTimeout:   30 * time.Second,
		IdleTimeout:    60 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1MB
	}

	log.Println("[MAIN] Server is running on :8081")
	log.Println("[MAIN] Available endpoints:")
	log.Println("[MAIN]   GET  / - Health check")
	log.Println("[MAIN]   GET  /tables - Get all tables")
	log.Println("[MAIN]   POST /tables - Create a new table")
	log.Println("[MAIN]   GET  /tables/{id} - Get a specific table")
	log.Println("[MAIN]   PUT  /tables/{id} - Update a table")
	log.Println("[MAIN]   DELETE /tables/{id} - Delete a table")
	log.Println("[MAIN]   POST /tables/{id}/append - Append item to table")

	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("[MAIN] Failed to start server: %v", err)
	}
}

package main

import (
	"log"
	"net/http"

	"ipfs-go-server/internal/handlers"
	"ipfs-go-server/internal/ipfs"

	"github.com/gorilla/mux"
)

func main() {
	// Initialize IPFS client with default API address
	ipfsClient := ipfs.NewIPFSClient("localhost:5001")

	router := mux.NewRouter()

	// Add a root handler
	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("IPFS Table Server is running"))
	}).Methods("GET")

	handlers.RegisterTableRoutes(router, ipfsClient)

	http.Handle("/", router)
	log.Println("Server is running on :8081")
	if err := http.ListenAndServe(":8081", nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

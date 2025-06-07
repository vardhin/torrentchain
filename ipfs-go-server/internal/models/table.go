package models

import (
	"sync"
)

type Table struct {
	Name   string
	Entries []string
	mu     sync.Mutex
}

func NewTable(name string) *Table {
	return &Table{
		Name:   name,
		Entries: []string{},
	}
}

func (t *Table) Append(entry string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Entries = append(t.Entries, entry)
}

func (t *Table) GetLatest() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.Entries) == 0 {
		return ""
	}
	return t.Entries[len(t.Entries)-1]
}

func (t *Table) GetAll() []string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.Entries
}
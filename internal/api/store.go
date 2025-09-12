package api

import (
    "sort"
    "sync"
    "time"
)

type Scale struct {
    ID        string            `json:"id"`
    Points    int               `json:"points"`
    Randomize bool              `json:"randomize"`
    NameI18n  map[string]string `json:"name_i18n,omitempty"`
}

type Item struct {
    ID            string            `json:"id"`
    ScaleID       string            `json:"scale_id"`
    ReverseScored bool              `json:"reverse_scored"`
    StemI18n      map[string]string `json:"stem_i18n"`
}

type Participant struct {
    ID    string `json:"id"`
    Email string `json:"email,omitempty"`
}

type Response struct {
    ParticipantID string    `json:"participant_id"`
    ItemID        string    `json:"item_id"`
    RawValue      int       `json:"raw_value"`
    ScoreValue    int       `json:"score_value"`
    SubmittedAt   time.Time `json:"submitted_at"`
}

type memoryStore struct {
    mu           sync.RWMutex
    scales       map[string]*Scale
    items        map[string]*Item
    itemsByScale map[string][]*Item
    participants map[string]*Participant
    responses    []*Response
}

func newMemoryStore() *memoryStore {
    return &memoryStore{
        scales:       map[string]*Scale{},
        items:        map[string]*Item{},
        itemsByScale: map[string][]*Item{},
        participants: map[string]*Participant{},
        responses:    []*Response{},
    }
}

func (s *memoryStore) addScale(sc *Scale) {
    s.mu.Lock(); defer s.mu.Unlock()
    s.scales[sc.ID] = sc
}

func (s *memoryStore) addItem(it *Item) {
    s.mu.Lock(); defer s.mu.Unlock()
    s.items[it.ID] = it
    s.itemsByScale[it.ScaleID] = append(s.itemsByScale[it.ScaleID], it)
    // keep stable order by id
    sort.Slice(s.itemsByScale[it.ScaleID], func(i, j int) bool { return s.itemsByScale[it.ScaleID][i].ID < s.itemsByScale[it.ScaleID][j].ID })
}

func (s *memoryStore) listItems(scaleID string) []*Item {
    s.mu.RLock(); defer s.mu.RUnlock()
    return append([]*Item(nil), s.itemsByScale[scaleID]...)
}

func (s *memoryStore) getScale(id string) *Scale {
    s.mu.RLock(); defer s.mu.RUnlock()
    return s.scales[id]
}

func (s *memoryStore) addParticipant(p *Participant) {
    s.mu.Lock(); defer s.mu.Unlock()
    s.participants[p.ID] = p
}

func (s *memoryStore) addResponses(rs []*Response) {
    s.mu.Lock(); defer s.mu.Unlock()
    s.responses = append(s.responses, rs...)
}

func (s *memoryStore) listResponsesByScale(scaleID string) []*Response {
    s.mu.RLock(); defer s.mu.RUnlock()
    out := make([]*Response, 0, len(s.responses))
    // filter by item scale
    for _, r := range s.responses {
        it := s.items[r.ItemID]
        if it != nil && it.ScaleID == scaleID {
            out = append(out, r)
        }
    }
    return out
}


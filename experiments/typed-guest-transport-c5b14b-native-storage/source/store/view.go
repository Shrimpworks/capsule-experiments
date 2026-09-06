package store

// View is copied diagnostic state for the local harness; it grants no effect authority.
type View struct {
	Generation                                 uint32
	SpawnIntent, Fenced, Unresolved, Completed bool
	Step, Resume, Failure                      uint32
}

func (s *Store) View() (View, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireCurrent(); err != nil {
		return View{}, err
	}
	v := s.current
	return View{v.Generation, v.SpawnIntent, v.Fenced, v.Unresolved, len(v.Completion) > 0, v.Step, v.Resume, v.Failure}, nil
}

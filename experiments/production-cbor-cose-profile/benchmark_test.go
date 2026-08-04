package profile

import "testing"

func BenchmarkExecutionPlanExact(b *testing.B) {
	p := mustProfile(b)
	fixture := loadJSON[executionPlanFixture](b, repoPath("schemas/fixtures/execution-plan-v0.json"))
	wire := mustHex(b, fixture.PayloadHex)
	bindings := executionBindings(b, fixture)
	b.ReportAllocs()
	b.SetBytes(int64(len(wire)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := p.DecodeExecutionPlan(wire, bindings); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkExecutionPlanRawCapPlusOne(b *testing.B) {
	p := mustProfile(b)
	fixture := loadJSON[executionPlanFixture](b, repoPath("schemas/fixtures/execution-plan-v0.json"))
	wire := mustRead(b, repoPath("schemas/conformance/v0/shared/cbor-execution-plan-raw-bytes-over.bin"))
	bindings := executionBindings(b, fixture)
	b.ReportAllocs()
	b.SetBytes(int64(len(wire)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := p.DecodeExecutionPlan(wire, bindings); err == nil {
			b.Fatal("cap-plus-one accepted")
		}
	}
}

func BenchmarkApprovalExact(b *testing.B) {
	p := mustProfile(b)
	wire := mustRead(b, repoPath("schemas/conformance/v0/approval-grant/ordinary.cose"))
	bindings := approvalBindings(b)
	b.ReportAllocs()
	b.SetBytes(int64(len(wire)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := p.VerifyApproval(wire, bindings); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkApprovalEnvelopeCapPlusOne(b *testing.B) {
	p := mustProfile(b)
	wire := mustRead(b, repoPath("schemas/conformance/v0/approval-grant/envelope-cap-plus-one.cose"))
	bindings := approvalBindings(b)
	b.ReportAllocs()
	b.SetBytes(int64(len(wire)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := p.VerifyApproval(wire, bindings); err == nil {
			b.Fatal("cap-plus-one accepted")
		}
	}
}

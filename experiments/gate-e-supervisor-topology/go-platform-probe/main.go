//go:build darwin

// Development-only Gate E probe. This is not a Capsule security boundary.
package main

/*
#cgo CFLAGS: -fblocks
#cgo LDFLAGS: -framework Security
#include <Security/Security.h>
#include <dispatch/dispatch.h>
#include <stdlib.h>
#include <xpc/xpc.h>

static void capsule_close_connection(xpc_connection_t connection) {
	xpc_connection_set_event_handler(connection, ^(xpc_object_t event) {
		(void)event;
	});
	xpc_connection_activate(connection);
	xpc_connection_cancel(connection);
}

static int capsule_code_requirement_status(const char *requirement) {
	xpc_connection_t connection = xpc_connection_create(NULL, NULL);
	int status = xpc_connection_set_peer_code_signing_requirement(connection, requirement);
	capsule_close_connection(connection);
	return status;
}

static int capsule_same_team_requirement_status(const char *signing_identifier) {
	xpc_connection_t connection = xpc_connection_create(NULL, NULL);
	int status = xpc_connection_set_peer_team_identity_requirement(connection, signing_identifier);
	capsule_close_connection(connection);
	return status;
}

static int capsule_self_dynamic_code_validity_status(void) {
	SecCodeRef code = NULL;
	OSStatus status = SecCodeCopySelf(kSecCSDefaultFlags, &code);
	if (status != errSecSuccess) {
		return (int)status;
	}
	status = SecCodeCheckValidity(code, kSecCSDefaultFlags, NULL);
	CFRelease(code);
	return (int)status;
}

static int capsule_apple_api_ping_status(void) {
	dispatch_queue_t queue = dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0);
	xpc_connection_t connection = xpc_connection_create_mach_service(
		"com.apple.container.apiserver", queue, 0);
	if (connection == NULL) {
		return 4;
	}

	dispatch_semaphore_t done = dispatch_semaphore_create(0);
	__block int result = 3;
	xpc_connection_set_event_handler(connection, ^(xpc_object_t event) {
		(void)event;
	});
	xpc_connection_activate(connection);

	xpc_object_t request = xpc_dictionary_create(NULL, NULL, 0);
	xpc_dictionary_set_string(request, "route", "ping");
	xpc_connection_send_message_with_reply(connection, request, queue, ^(xpc_object_t reply) {
		xpc_type_t type = xpc_get_type(reply);
		if (type == XPC_TYPE_DICTIONARY) {
			result = 0;
		} else if (type == XPC_TYPE_ERROR) {
			result = 2;
		}
		dispatch_semaphore_signal(done);
	});

	if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC)) != 0) {
		result = 1;
	}
	xpc_connection_cancel(connection);
	return result;
}
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"os"
	"unsafe"
)

type probeResult struct {
	Language                       string `json:"language"`
	ValidCodeRequirementStatus     int    `json:"validCodeRequirementStatus"`
	MalformedCodeRequirementStatus int    `json:"malformedCodeRequirementStatus"`
	SameTeamRequirementStatus      int    `json:"sameTeamRequirementStatus"`
	SelfDynamicCodeValidityStatus  int    `json:"selfDynamicCodeValidityStatus"`
	AppleAPIPingStatus             *int   `json:"appleApiPingStatus,omitempty"`
}

func codeRequirementStatus(requirement string) int {
	value := C.CString(requirement)
	defer C.free(unsafe.Pointer(value))
	return int(C.capsule_code_requirement_status(value))
}

func sameTeamRequirementStatus(signingIdentifier string) int {
	value := C.CString(signingIdentifier)
	defer C.free(unsafe.Pointer(value))
	return int(C.capsule_same_team_requirement_status(value))
}

func runProbe() probeResult {
	return probeResult{
		Language: "go-cgo",
		ValidCodeRequirementStatus: codeRequirementStatus(
			`anchor apple generic and identifier "com.example.capsule.peer"`,
		),
		MalformedCodeRequirementStatus: codeRequirementStatus("this is not a code requirement"),
		SameTeamRequirementStatus:      sameTeamRequirementStatus("com.example.capsule.peer"),
		SelfDynamicCodeValidityStatus:  int(C.capsule_self_dynamic_code_validity_status()),
	}
}

func validateProbe(result probeResult) error {
	if result.ValidCodeRequirementStatus != 0 {
		return fmt.Errorf("SDK rejected a syntactically valid peer code requirement: %d", result.ValidCodeRequirementStatus)
	}
	if result.MalformedCodeRequirementStatus == 0 {
		return fmt.Errorf("SDK accepted a malformed peer code requirement")
	}
	if result.SameTeamRequirementStatus != 0 {
		return fmt.Errorf("SDK rejected a syntactically valid same-team requirement: %d", result.SameTeamRequirementStatus)
	}
	return nil
}

func main() {
	result := runProbe()
	if len(os.Args) == 2 && os.Args[1] == "--apple-api-ping" {
		status := int(C.capsule_apple_api_ping_status())
		result.AppleAPIPingStatus = &status
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := validateProbe(result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if result.AppleAPIPingStatus != nil && *result.AppleAPIPingStatus != 0 {
		fmt.Fprintf(os.Stderr, "Apple container API ping failed with status %d\n", *result.AppleAPIPingStatus)
		os.Exit(1)
	}
}

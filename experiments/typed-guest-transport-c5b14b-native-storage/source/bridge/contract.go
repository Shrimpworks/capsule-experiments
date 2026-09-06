package main

/*
#include <signal.h>
#include <stdint.h>
static int reaper_contract(void) {
 struct sigaction action;
 return sigaction(SIGCHLD, 0, &action)==0 && action.sa_handler==SIG_DFL && !(action.sa_flags & SA_NOCLDWAIT);
}
*/
import "C"

//export BridgeContractCheck
func BridgeContractCheck() C.int { return C.reaper_contract() }

func main() {}

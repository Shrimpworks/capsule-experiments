/* Benign protocol fixture only: no interpreter, guest, backend or path inputs. */
#include <CommonCrypto/CommonDigest.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include "payloads.h"
#ifndef FIXTURE_MODE
#define FIXTURE_MODE 0
#endif
static void require(int ok) { if (!ok) _exit(80); }
static void read_exact(int fd, uint8_t *b, size_t length) {
    size_t used=0; while(used<length) { ssize_t n=read(fd,b+used,length-used); require(n>0); used+=(size_t)n; }
    uint8_t extra; require(read(fd,&extra,1)==0);
}
int main(int argc, char **argv) {
    require(argc==1 && strcmp(argv[0],"fixture-runner")==0);
    alarm(4); /* Independent containment if a mutation aborts the test parent. */
    /* Darwin can synthesize this entry before main despite empty spawn env. */
    unsetenv("__CF_USER_TEXT_ENCODING"); extern char **environ; require(!environ[0]);
    struct stat stats[8];
    const int access[8]={O_RDONLY,O_WRONLY,O_WRONLY,O_RDONLY,O_RDONLY,O_RDONLY,O_RDONLY,O_WRONLY};
    for(int fd=0;fd<8;fd++) {
        require(fstat(fd,&stats[fd])==0 && (fcntl(fd,F_GETFL)&O_ACCMODE)==access[fd]);
        if(fd==0)require(S_ISCHR(stats[fd].st_mode));
        else if(fd==4)require(S_ISREG(stats[fd].st_mode) && stats[fd].st_size==65536 && stats[fd].st_nlink==0);
        else require(S_ISFIFO(stats[fd].st_mode));
    }
    for(int fd=8;fd<1024;fd++)require(fcntl(fd,F_GETFD)==-1);
    uint8_t root[65536]; read_exact(4,root,sizeof(root));
    for(size_t i=0;i<sizeof(root);i++)require(root[i]==(uint8_t)((i*17+29)%251));
    if(FIXTURE_MODE==1)for(;;)pause();
    require(write(1,"R",1)==1);
    uint8_t source[152+sizeof(source_payload)],input[152+sizeof(input_payload)];
    read_exact(5,source,sizeof(source));read_exact(6,input,sizeof(input));
    require(memcmp(source,"CPSRC001",8)==0 && memcmp(input,"CPINP001",8)==0);
    require(memcmp(source+16,input+16,96)==0);
    require(memcmp(source+152,source_payload,sizeof(source_payload))==0);
    require(memcmp(input+152,input_payload,sizeof(input_payload))==0);
    uint8_t start;read_exact(3,&start,1);require(start=='G');
    uint8_t completion[160+sizeof(completion_payload)+64]={0};
    memcpy(completion,"CPCMP001",8);completion[9]=1;completion[11]=1;completion[13]=3;completion[15]=160;
    memcpy(completion+16,source+16,96);completion[113]=1;completion[127]=sizeof(completion_payload);
    CC_SHA256(completion_payload,sizeof(completion_payload),completion+128);
    memcpy(completion+160,completion_payload,sizeof(completion_payload));
    uint8_t *trailer=completion+160+sizeof(completion_payload);
    memcpy(trailer,"CPEND001",8);trailer[9]=1;trailer[11]=1;trailer[13]=3;trailer[15]=64;
    memcpy(trailer+16,source+16,16);CC_SHA256(completion,160+sizeof(completion_payload),trailer+32);
    if(FIXTURE_MODE==3)completion[128]^=1;
    require(write(7,completion,sizeof(completion))==(ssize_t)sizeof(completion));
    return FIXTURE_MODE==2?23:0;
}

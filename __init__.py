import warnings
warnings.simplefilter("ignore", UserWarning)

from parse_args import parse_args
from server import main

def entry_point():
    args = parse_args()
    main(args)
    
if __name__ == '__main__':
    entry_point()
